const setting = require("../modals/setting");
const User = require("../modals/user");
const City = require("../modals/city");
const Notification = require("../modals/notification");
const Banner = require("../modals/banner");
const Category = require("../modals/category");
const Earning = require("../modals/earning");
const BannerPlan = require("../modals/banner_type");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { getDistanceKm } = require("../utils/location");
const sendFcmPush = require("../utils/firebase/sendNotification");
const Filter = require("../modals/filter");
const UserNotification = require("../modals/userNotification");
const HelpForm = require("../modals/help_form")
const {
  normalizeFcmToken,
  isLikelyFcmToken,
} = require("../utils/firebase/fcmToken");
const {
  getCoordinateInputsFromBody,
  normalizeObjectIdInput,
} = require("../utils/bannerHelpers");
const {
  resolveAdminBannerLocationFields,
} = require("../utils/adminBannerHelpers");

const { getBannerExpiryDate } = require("../utils/bannerHelpers");

const toArray = (value) => {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [trimmed];
      } catch (error) {
        return [trimmed];
      }
    }

    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [trimmed];
  }

  return [value];
};

const normalizeCityIds = (value) => {
  const rawValues = toArray(value);
  const cityIds = [];

  for (const raw of rawValues) {
    const cityId = String(raw || "").trim();
    if (!cityId) continue;

    const lowered = cityId.toLowerCase();
    if (lowered === "all" || lowered === "everyone") continue;

    if (mongoose.Types.ObjectId.isValid(cityId)) {
      cityIds.push(cityId);
    }
  }

  return [...new Set(cityIds)];
};

const parseNotificationData = (value) => {
  if (value === undefined || value === null || value === "") return {};

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (error) {
      return {};
    }
  }

  return {};
};

const parseRadius = (value, fallback = 5) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

exports.addAdminBanner = async (req, res) => {
  try {
    const { title, mainCategory, subCategory, selectedPlanId } = req.body;

    const { latitude: latitudeInput, longitude: longitudeInput } =
      getCoordinateInputsFromBody(req.body);

    if (!mainCategory) {
      return res.status(400).json({ message: "Main category is required" });
    }

    if (!title || String(title).trim() === "") {
      return res.status(400).json({ message: "Title is required" });
    }

    // Validate and normalize selectedPlanId
    const normalizedPlanId = normalizeObjectIdInput(selectedPlanId);
    if (!normalizedPlanId) {
      return res.status(400).json({ message: "selectedPlanId is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(normalizedPlanId)) {
      return res.status(400).json({ message: "Invalid selectedPlanId" });
    }

    // Fetch and validate the banner plan
    const selectedPlan = await BannerPlan.findOne({
      _id: normalizedPlanId,
      status: true,
    })
      .select("_id duration status price")
      .lean();

    if (!selectedPlan) {
      return res.status(404).json({
        message: `Plan ${normalizedPlanId} not found or inactive`,
      });
    }

    const now = new Date();

    const foundCategory = await Category.findById(mainCategory).lean();
    if (!foundCategory) {
      return res
        .status(404)
        .json({ message: `Category ${mainCategory} not found` });
    }

    const hasSubCategory = subCategory && String(subCategory).trim() !== "";
    let foundSubCategory = null;

    if (hasSubCategory) {
      foundSubCategory = foundCategory.subcat.find(
        (sub) => sub._id.toString() === String(subCategory),
      );

      if (!foundSubCategory) {
        return res
          .status(404)
          .json({ message: `SubCategory ${subCategory} not found` });
      }
    }

    const rawImagePath = req.files?.image?.[0]?.key || "";
    const image = rawImagePath ? `/${rawImagePath}` : "";

    const locationResolution = await resolveAdminBannerLocationFields({
      latitudeInput,
      longitudeInput,
    });

    if (locationResolution.error) {
      return res
        .status(locationResolution.error.status)
        .json({ message: locationResolution.error.message });
    }

    // Calculate toDate based on plan duration (in months)
    const toDate = new Date(now);
    toDate.setMonth(toDate.getMonth() + selectedPlan.duration);

    const banner = await Banner.create({
      image,
      title,
      ...locationResolution.fields,
      userId: null,
      aprroveStatus: "active",
      approvalReason: "",
      approvedAt: now,
      selectedPlanId: normalizedPlanId,
      fromDate: now,
      toDate,
      status: true,
      mainCategory: foundCategory._id,
      subCategory: foundSubCategory ? foundSubCategory._id : null,
    });

    return res.status(201).json({
      message: "Admin banner added successfully",
      data: banner,
    });
  } catch (error) {
    console.error("Add admin banner error:", error);
    return res.status(500).json({
      message: "Failed to add admin banner",
      error: error.message,
    });
  }
};

exports.adminSetting = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      term_and_conditons,
      safety_and_policy,
      radius,
      razor_pay_key,
      expiryReminderDays,
      freeProductExpiryDays,
      enquiry_number
    } = req.body;
    const rawImagePath = req.files?.image?.[0]?.key;

    const updateData = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (email !== undefined) {
      updateData.email = email;
    }

    if (password !== undefined) {
      updateData.password = password;
    }

    if (term_and_conditons !== undefined) {
      updateData.term_and_conditons = term_and_conditons;
    }

    if(enquiry_number !== undefined){
      updateData.enquiry_number = enquiry_number;
    }

    if (safety_and_policy !== undefined) {
      updateData.safety_and_policy = safety_and_policy;
    }

    if (radius !== undefined) {
      updateData.radius = radius;
    }

    if(razor_pay_key !== undefined){
      updateData.razor_pay_key = razor_pay_key;
    }

    if (expiryReminderDays !== undefined) {
      const parsed = Number(expiryReminderDays);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ message: "Invalid expiryReminderDays" });
      }
      updateData.expiryReminderDays = parsed;
    }

    if (freeProductExpiryDays !== undefined) {
      const parsed = Number(freeProductExpiryDays);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ message: "Invalid freeProductExpiryDays" });
      }
      updateData.freeProductExpiryDays = parsed;
    }

    if (rawImagePath) {
      updateData.image = `/${rawImagePath}`;
    }

    await setting.findOneAndUpdate(
      {},
      { $set: updateData },
      { new: true, upsert: true },
    );

    return res.status(200).json({
      message: "Setting updated successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Failed to update setting",
    });
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const settings = await setting.findOne().lean();
    if (!settings || !settings.email || !settings.password) {
      return res.status(404).json({
        message:
          "Admin credentials are not configured. Please update settings first.",
      });
    }

    const incomingEmail = String(email).trim().toLowerCase();
    const storedEmail = String(settings.email).trim().toLowerCase();
    const incomingPassword = String(password);
    const storedPassword = String(settings.password);

    if (incomingEmail !== storedEmail || incomingPassword !== storedPassword) {
      return res.status(401).json({
        message: "Invalid admin credentials",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "JWT secret is not configured",
      });
    }

    const token = jwt.sign(
      {
        id: settings._id,
        role: "admin",
        email: settings.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    return res.status(200).json({
      message: "Admin login successful",
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      admin: {
        name: settings.name || "",
        email: settings.email || "",
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({
      message: "Failed to login as admin",
    });
  }
};

exports.getAdminSetting = async (req, res) => {
  try {
    const settings = await setting.findOne().lean();

    if (!settings) {
      return res.status(404).json({
        message: "Settings not found",
      });
    }

    return res.status(200).json({
      message: "Setting fetched successfully",
      data: settings,
    });
  } catch (error) {
    console.error("Get admin settings error:", error);

    return res.status(500).json({
      message: "Failed to fetch settings",
    });
  }
};

exports.getAppSetting = async (req, res) => {
  try {
    const settings = await setting
      .findOne()
      .select("term_and_conditons safety_and_policy razor_pay_key radius enquiry_number")
      .lean();

    return res.status(200).json({
      message: "Setting fetched successfully",
      data: {
        term_and_conditions: settings?.term_and_conditons ?? "",
        safety_and_policy: settings?.safety_and_policy ?? "",
        razor_pay_key: settings?.razor_pay_key ?? "",
        radius: settings?.radius ?? 20,
        enquiry_number: settings?.enquiry_number ?? "",
      },
    });
  } catch (error) {
    console.error("Get app settings error:", error);

    return res.status(500).json({
      message: "Failed to fetch settings",
    });
  }
};

exports.getAdminDashboard = async (req, res) => {
  try {
    const baseMatch = { status: "recorded" };

    const buildBreakdown = (rows) => {
      const breakdown = {
        product: { total: 0, count: 0 },
        banner: { total: 0, count: 0 },
      };

      for (const row of rows || []) {
        if (!row?._id) continue;
        if (!breakdown[row._id]) continue;
        breakdown[row._id] = {
          total: Number(row.total || 0),
          count: Number(row.count || 0),
        };
      }

      return {
        total: breakdown.product.total + breakdown.banner.total,
        count: breakdown.product.count + breakdown.banner.count,
        bySource: breakdown,
      };
    };

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [allTimeRows, todayRows, monthRows, recent] = await Promise.all([
      Earning.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: "$sourceType",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Earning.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: todayStart } } },
        {
          $group: {
            _id: "$sourceType",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Earning.aggregate([
        { $match: { ...baseMatch, createdAt: { $gte: monthStart } } },
        {
          $group: {
            _id: "$sourceType",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Earning.find(baseMatch)
        .select(
          "sourceType amount transactionId userId referenceModel referenceId createdAt status meta",
        )
        .populate("userId", "name email mobileNumber image")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    return res.status(200).json({
      message: "Dashboard fetched successfully",
      data: {
        revenue: {
          allTime: buildBreakdown(allTimeRows),
          today: buildBreakdown(todayRows),
          month: buildBreakdown(monthRows),
        },
        recentEarnings: recent,
      },
    });
  } catch (error) {
    console.error("Get admin dashboard error:", error);
    return res.status(500).json({ message: "Failed to fetch dashboard" });
  }
};

exports.createNotification = async (req, res) => {
  try {
    const {
      title,
      type,
      sendType = "user",
      description,
      data = {},
      city,
      refId,
      screen,
    } = req.body;

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({
        message: "Title and description are required",
      });
    }

    const image = req.files?.image?.[0]?.key
      ? `/${req.files.image[0].key}`
      : undefined;

    const notificationPayload = {
      title: title.trim(),
      type,
      sendType,
      description: description.trim(),
      data: parseNotificationData(data),
      city: normalizeCityIds(city),
      screen,
      refId,
    };

    if (image) {
      notificationPayload.image = image;
    }

    const notification = await Notification.create(notificationPayload);

    return res.status(201).json({
      message: "Notification created successfully",
      data: notification,
    });
  } catch (error) {
    console.error("Create Notification Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.editNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    const updateData = {};

    if (req.body.title !== undefined) {
      updateData.title = String(req.body.title).trim();
    }

    if (req.body.type !== undefined) {
      updateData.type = req.body.type;
    }

    if (req.body.sendType !== undefined) {
      updateData.sendType = req.body.sendType;
    }

    if (req.body.description !== undefined) {
      updateData.description = String(req.body.description).trim();
    }

    if (req.body.data !== undefined) {
      updateData.data = parseNotificationData(req.body.data);
    }

    if (req.body.city !== undefined) {
      updateData.city = normalizeCityIds(req.body.city);
    }

    if (req.body.screen !== undefined) {
      updateData.screen = req.body.screen;
    }
    if (req.body.refId !== undefined) {
      updateData.refId = req.body.refId;
    }

    if (req.files?.image?.length) {
      updateData.image = `/${req.files.image[0].key}`;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        message: "No valid fields provided for update",
      });
    }

    const notification = await Notification.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({
      message: "Notification updated successfully",
      data: notification,
    });
  } catch (error) {
    console.error("Edit Notification Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .lean();

    const normalizedNotifications = notifications.map((notification) => ({
      ...notification,
      city: normalizeCityIds(notification.city),
    }));

    return res.status(200).json({
      message: "Notifications fetched successfully",
      data: normalizedNotifications,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.sendNotification = async (req, res) => {
  try {
    const { notificationId, radius = 5 } = req.body;

    if (!notificationId || !mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    const notification = await Notification.findById(notificationId).lean();
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const globalSettings = await setting.findOne().select("radius").lean();
    const configuredRadiusKm = parseRadius(globalSettings?.radius, 20);
    const requestedRadiusKm = parseRadius(radius, configuredRadiusKm);
    const radiusKm = Math.max(requestedRadiusKm, configuredRadiusKm);

    const cityIds = normalizeCityIds(notification.city);

    let users = [];
    let cityCount = 0;
    let nearestUserDistanceKm = null;

    if (!cityIds.length) {
      users = await User.find({
        fcmToken: { $exists: true, $ne: "" },
      })
        .select("_id fcmToken")
        .lean();
    } else {
      const cities = await City.find({
        _id: { $in: cityIds },
      })
        .select("latitude longitude")
        .lean();
      cityCount = cities.length;

      if (!cities.length) {
        return res.status(400).json({
          message: "No valid cities found for this notification",
        });
      }

      const allUsers = await User.find({
        fcmToken: { $exists: true, $ne: "" },
        latitude: { $exists: true, $ne: null },
        longitude: { $exists: true, $ne: null },
      })
        .select("_id fcmToken latitude longitude")
        .lean();

      for (const user of allUsers) {
        const isWithinAnyCityRadius = cities.some((city) => {
          if (
            typeof city.latitude !== "number" ||
            typeof city.longitude !== "number"
          ) {
            return false;
          }

          if (
            typeof user.latitude !== "number" ||
            typeof user.longitude !== "number"
          ) {
            return false;
          }

          const distance = getDistanceKm(
            city.latitude,
            city.longitude,
            user.latitude,
            user.longitude,
          );

          if (
            nearestUserDistanceKm === null ||
            distance < nearestUserDistanceKm
          ) {
            nearestUserDistanceKm = distance;
          }

          return distance <= radiusKm;
        });

        if (isWithinAnyCityRadius) {
          users.push(user);
        }
      }
    }

    const uniqueUsers = Array.from(
      new Map(users.map((user) => [user._id.toString(), user])).values(),
    );
    const normalizedUsers = uniqueUsers.map((user) => ({
      ...user,
      fcmToken: normalizeFcmToken(user.fcmToken),
    }));

    const usersWithValidToken = normalizedUsers.filter((user) =>
      isLikelyFcmToken(user.fcmToken),
    );
    const invalidTokenUsers = normalizedUsers.filter(
      (user) => !isLikelyFcmToken(user.fcmToken),
    );

    if (invalidTokenUsers.length) {
      const invalidUserIds = invalidTokenUsers.map((user) => user._id);
      await User.updateMany(
        { _id: { $in: invalidUserIds } },
        { $unset: { fcmToken: 1 } },
      );
    }

    if (!usersWithValidToken.length) {
      return res.status(200).json({
        message:
          "No valid device tokens found for this notification. Users must refresh login/update FCM token.",
        sentCount: 0,
        failedCount: 0,
        invalidTokenCount: invalidTokenUsers.length,
        targeting: {
          cityCount,
          configuredRadiusKm,
          requestedRadiusKm,
          effectiveRadiusKm: radiusKm,
          nearestUserDistanceKm:
            nearestUserDistanceKm === null
              ? null
              : Number(nearestUserDistanceKm.toFixed(2)),
        },
      });
    }

    const pushPayload = {
      title: notification.title,
      body: notification.description,
      data: notification.data || {},
      image: notification.image || undefined,
    };

    const sendResults = await Promise.allSettled(
      usersWithValidToken.map((user) =>
        sendFcmPush(user.fcmToken, pushPayload),
      ),
    );

    const notificationDocs = usersWithValidToken.map((user) => ({
      userId: user._id,
      title: notification.title,
      description: notification.description,
      screen: notification.screen,
      refId: notification.refId,
    }));

    await UserNotification.insertMany(notificationDocs);

    const failedCount = sendResults.filter(
      (result) => result.status === "rejected",
    ).length;
    const sentCount = sendResults.length - failedCount;
    const failedReasons = [
      ...new Set(
        sendResults
          .filter((result) => result.status === "rejected")
          .map(
            (result) =>
              result.reason?.errorInfo?.message ||
              result.reason?.message ||
              "Unknown push error",
          ),
      ),
    ];

    return res.status(200).json({
      message: failedCount
        ? "Notification sent with partial failures"
        : "Notification sent successfully",
      sentCount,
      failedCount,
      totalTargetedUsers: usersWithValidToken.length,
      invalidTokenCount: invalidTokenUsers.length,
      failedReasons,
    });
  } catch (error) {
    console.error("Send Notification Error:", error);

    if (error?.code === "FIREBASE_CONFIG_MISSING") {
      return res.status(500).json({
        message:
          "Firebase configuration missing. Set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_BASE64, or FIREBASE_SERVICE_ACCOUNT_PATH.",
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

exports.addFilter = async (req, res) => {
  try {
    const { filter, categoryId, subCategoryId } = req.body;

    if (!filter || !categoryId) {
      return res.status(400).json({
        message: "Filter and categoryId are required",
      });
    }

    const newFilter = await Filter.create({
      filter,
      categoryId,
      subCategoryId: subCategoryId || null,
    });

    return res.status(201).json({
      message: "Filter added successfully",
      data: newFilter,
    });
  } catch (error) {
    console.error("Add Filter Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.editFilter = async (req, res) => {
  try {
    const { id } = req.params;
    const { filter, categoryId, subCategoryId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid filter ID" });
    }

    const updateData = {};

    if (filter !== undefined) {
      updateData.filter = filter;
    }

    if (categoryId !== undefined) {
      updateData.categoryId = categoryId;
    }

    if (subCategoryId !== undefined) {
      updateData.subCategoryId = subCategoryId || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        message: "No valid fields provided for update",
      });
    }

    const updatedFilter = await Filter.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    if (!updatedFilter) {
      return res.status(404).json({ message: "Filter not found" });
    }

    return res.status(200).json({
      message: "Filter updated successfully",
      data: updatedFilter,
    });
  } catch (error) {
    console.error("Edit Filter Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getAllFilters = async (req, res) => {
  try {
    const filters = await Filter.find().lean();

    return res.status(200).json({
      message: "Filters fetched successfully",
      data: filters,
    });
  } catch (error) {
    console.error("Get All Filters Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteFilter = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "filter ID missing" });
    }

    const deletedFilter = await Filter.findByIdAndDelete(id);

    if (!deletedFilter) {
      return res.status(404).json({ message: "Filter not found" });
    }

    return res.status(200).json({
      message: "Filter deleted successfully",
    });
  } catch (error) {
    console.error("Delete Filter Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteNotificationAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    const deletedNotification = await Notification.findByIdAndDelete(id);

    if (!deletedNotification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Delete Notification Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getHelpForms = async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status) {
      query.status = String(status).trim().toLowerCase();
    }

    const helpForms = await HelpForm.find(query)
      .populate("userId", "name email mobileNumber")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      message: "Help forms fetched successfully",
      data: helpForms,
    });
  } catch (error) {
    console.error("Get Help Forms Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateHelpFormStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid help form ID" });
    }

    const normalizedStatus = String(status || "").trim().toLowerCase();
    const allowedStatuses = ["pending", "completed"];

    if (!allowedStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}`,
      });
    }

    const updatedHelpForm = await HelpForm.findByIdAndUpdate(
      id,
      { $set: { status: normalizedStatus } },
      { new: true, runValidators: true },
    )
      .populate("userId", "name email mobileNumber")
      .lean();

    if (!updatedHelpForm) {
      return res.status(404).json({ message: "Help form not found" });
    }

    return res.status(200).json({
      message: "Help form status updated successfully",
      data: updatedHelpForm,
    });
  } catch (error) {
    console.error("Update Help Form Status Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};