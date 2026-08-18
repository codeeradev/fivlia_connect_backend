const User = require("../modals/user");
const jwt = require("jsonwebtoken");
const OtpModel = require("../modals/otp");
const Product = require("../modals/product");
const BannerPlan = require("../modals/banner_type");
const ProductPlan = require("../modals/product_plan");
const Banner = require("../modals/banner");
const Setting = require("../modals/setting");
const sendFcmPush = require("../utils/firebase/sendNotification");
const { recordBannerEarning } = require("../utils/bannerEarnings");
const UserNotification = require("../modals/userNotification");
const { sendMessages } = require("../utils/sendMessages");
const HelpForm = require("../modals/help_form")

const {
  normalizeFcmToken,
  isLikelyFcmToken,
} = require("../utils/firebase/fcmToken");

exports.register = async (req, res) => {
  try {
    const { name, mobileNumber, email, adharCardNumber } = req.body;

    const user = await User.findOne({
      $or: [{ mobileNumber }, { email }],
    });
    
    if (user) {
      return res
        .status(400)
        .json({ message: "User already exists please login" });
    }

    const adharFrontImage = `/${req.files?.image?.[0]?.key ? req.files?.image?.[0]?.key : ""}`;
    const adharBackImage = `/${req.files?.MultipleImage?.[0]?.key ? req.files?.MultipleImage?.[0]?.key : ""}`;
    await User.create({
      name,
      mobileNumber,
      email,
      adharCardNumber,
      adharFrontImage,
      adharBackImage,
    });

    const otp =
      mobileNumber === "+919999999999"
        ? 123456
        : Math.floor(100000 + Math.random() * 900000);
    const message = `Dear Customer Your Fivlia Login OTP code is ${otp}. Valid for 5 minutes. Do not share with others Fivlia - Delivery in Minutes!`;

    try {
      await OtpModel.create(
        {
          mobileNumber,
          otp,
          expiresAt: Date.now() + 2 * 60 * 1000,
        },
        { upsert: true, new: true },
      );

      const response = await sendMessages(
        mobileNumber,
        message,
        "1707176060665820902",
      );
      return res.status(200).json({
        status: 1,
        message: "OTP sent successfully",
        data: response,
      });
    } catch (err) {
      console.error("Failed to send OTP:", err);
      return res.status(500).json({
        status: 2,
        message: "Failed to send OTP",
        error: err.message,
      });
    }
  } catch (error) {
    console.error("Error creating user:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { mobileNumber, fcmToken } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({ message: "mobileNumber is required" });
    }

    const user = await User.findOne({ mobileNumber });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const otp =
      mobileNumber === "+919999999999"
        ? 123456
        : Math.floor(100000 + Math.random() * 900000);
    const message = `Dear Customer Your Fivlia Login OTP code is ${otp}. Valid for 5 minutes. Do not share with others Fivlia - Delivery in Minutes!`;

    const normalizedFcmToken = normalizeFcmToken(fcmToken);
    if (isLikelyFcmToken(normalizedFcmToken)) {
      user.fcmToken = normalizedFcmToken;
      await user.save();
    }

    try {
      await OtpModel.create(
        {
          mobileNumber,
          otp,
          expiresAt: Date.now() + 2 * 60 * 1000,
        },
        { upsert: true, new: true },
      );

      const response = await sendMessages(
        mobileNumber,
        message,
        "1707176060665820902",
      );
      return res.status(200).json({
        status: 1,
        message: "OTP sent successfully",
        data: response,
      });
    } catch (err) {
      console.error("Failed to send OTP:", err);
      return res.status(500).json({
        status: 2,
        message: "Failed to send OTP",
        error: err.message,
      });
    }
  } catch (error) {
    console.error("Error in login:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { mobileNumber, otp } = req.body;
    // Find OTP in DB

    const user = await User.findOne({ mobileNumber });
    if (!user) {
      return res.status(401).json({ message: "Invalid mobile number" });
    }

    const otpRecord = await OtpModel.findOne({ mobileNumber, otp });
    console.log("otpRecord", otpRecord);
    if (!otpRecord) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await OtpModel.deleteOne({ _id: otpRecord._id });
    const token = jwt.sign(
      { id: user._id, mobileNumber: user.mobileNumber },
      process.env.JWT_SECRET,
    );

    return res.status(200).json({
      message: "Login Successfully",
      token,
      userId: user._id,
      userName: user.name,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "An error occurred" });
  }
};

exports.updateFcmToken = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user;
    const normalizedFcmToken = normalizeFcmToken(req.body?.fcmToken);

    if (!isLikelyFcmToken(normalizedFcmToken)) {
      return res.status(400).json({ message: "Invalid FCM token" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { fcmToken: normalizedFcmToken } },
      { new: true },
    ).select("_id fcmToken updatedAt");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "FCM token updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Update FCM token error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find();
    return res.status(200).json({ message: "Users", users });
  } catch (error) {
    console.error("Error creating store:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    let userId = req.user;
    const user = await User.findById(userId);
    return res.status(200).json({ message: "Users", user });
  } catch (error) {
    console.error("Error creating store:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

exports.editProfile = async (req, res) => {
  try {
    const userId = req.user;
    const { name, mobileNumber, email } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (mobileNumber !== undefined) updateData.mobileNumber = mobileNumber;
    if (email !== undefined) updateData.email = email;
    if (name !== undefined) updateData.name = name;
    if (req.files?.image) {
      updateData.image = `/${req.files.image[0].key}`;
    }
    await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    });

    return res.status(200).json({ message: "Profile Update" });
  } catch (error) {
    console.error("Error creating store:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.planRenewal = async (req, res) => {
  try {
    const userId = req.user;
    const { id, type, transactionId } = req.body;

    if (!id || !type) {
      return res.status(400).json({ message: "id and type are required" });
    }

    if (!transactionId || String(transactionId).trim() === "") {
      return res.status(400).json({
        message: "Transaction ID is required for renewal",
      });
    }

    const normalizedTransactionId = String(transactionId).trim();

    /*
    PRODUCT RENEWAL
    */
    if (type === "product") {
      const product = await Product.findById(id);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Reset expiry based on payment type and plan
      if (product.paymentType === "paid") {
        if (product.selectedPlanId) {
          const selectedPlan = await ProductPlan.findById(
            product.selectedPlanId,
          )
            .select("duration")
            .lean();
          if (selectedPlan) {
            product.expiryDays = selectedPlan.duration;
          }
        }
      } else if (product.paymentType === "free") {
        const settings = await Setting.findOne()
          .select("freeProductExpiryDays")
          .lean();
        product.expiryDays = settings?.freeProductExpiryDays ?? 90;
      }

      // Calculate new expiry date
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + product.expiryDays);
      product.expiresAt = expiryDate;

      product.productStatus = "active";
      product.transactionId = normalizedTransactionId;
      await product.save();

      // Record renewal earning using plan price
      if (product.paymentType === "paid" && product.selectedPlanId) {
        const selectedPlan = await ProductPlan.findById(product.selectedPlanId)
          .select("price")
          .lean();

        let amount = Number(selectedPlan?.price ?? 0);
        if (!Number.isFinite(amount) || amount < 0) amount = 0;

        try {
          await Earning.create({
            sourceType: "product",
            amount,
            transactionId: normalizedTransactionId,
            userId,
            referenceModel: "product",
            referenceId: product._id,
            meta: {
              renewal: true,
            },
          });
        } catch (earningError) {
          if (earningError?.code !== 11000) {
            console.error("Failed to record product renewal:", earningError);
          }
        }
      }
    }

    /*
    BANNER RENEWAL
    */
    if (type === "banner") {
      const banner = await Banner.findById(id);

      if (!banner) {
        return res.status(404).json({ message: "Banner not found" });
      }

      const selectedPlan = await BannerPlan.findById(banner.selectedPlanId)
        .select("_id price type")
        .lean();

      if (!selectedPlan) {
        return res.status(404).json({ message: "Banner plan not found" });
      }

      banner.status = true;
      banner.transactionId = normalizedTransactionId;
      banner.aprroveStatus = "active";
      await banner.save();

      try {
        await recordBannerEarning({
          transactionId: normalizedTransactionId,
          userId,
          bannerId: banner._id,
          selectedPlan,
        });
      } catch (err) {
        console.error("Failed to record banner renewal:", err);
      }
    }

    return res.status(200).json({
      message: "Plan renewed successfully",
    });
  } catch (error) {
    console.error("Error renewing plan:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.sendChatNotification = async (req, res) => {
  try {
    const { name, receiverId, message } = req.body;

    if (!receiverId || !message) {
      return res
        .status(400)
        .json({ message: "ReceiverId and message are required" });
    }

    const receiver = await User.findById(receiverId).select("fcmToken").lean();
    if (!receiver || !receiver.fcmToken) {
      return res
        .status(404)
        .json({ message: "Receiver not found or has no FCM token" });
    }

    const pushPayload = {
      title: name,
      body: message,
      data: {},
    };

    const result = sendFcmPush(receiver.fcmToken, pushPayload);

    console.log("Chat notification sent:", result);
    res.json({ message: "Notification sent" });
  } catch (error) {
    console.error("Error sending chat notification:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { type, id } = req.body;
    const userId = req.user;

    if (type === "single") {
      await UserNotification.deleteOne({
        _id: id,
        userId,
      });
    }

    if (type === "all") {
      await UserNotification.deleteMany({
        userId,
      });
    }

    return res.status(200).json({
      message: "Notification deleted",
    });
  } catch (error) {
    console.error("Delete notification error:", error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

exports.getUserNotifications = async (req, res) => {
  const userId = req.user;

  const notifications = await UserNotification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  res.json({
    data: notifications,
    unreadCount,
  });
};

exports.contactUsForm = async (req, res) => {
  try {
    const userId = req.user;
    const { title, message } = req.body;
    
    const request = await HelpForm.create({
      title,
      message,
      userId,
    });

    return res.status(200).json({
      message: "Request submitted successfully",
      data: request,
    });
  } catch (error) {
    console.error("Error submitting contact us form:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.addAdminUser = async (req, res) => {
  try {
    const { name, mobileNumber, email, latitude, longitude } = req.body;
    const normalizedName = String(name || "").trim();
    const normalizedMobileNumber = String(mobileNumber || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedLatitude = Number(latitude);
    const normalizedLongitude = Number(longitude);

    if (!normalizedName) {
      return res.status(400).json({ message: "User name is required" });
    }
    if (!normalizedMobileNumber) {
      return res.status(400).json({ message: "Mobile number is required" });
    }
    if (
      !Number.isFinite(normalizedLatitude) ||
      normalizedLatitude < -90 ||
      normalizedLatitude > 90 ||
      !Number.isFinite(normalizedLongitude) ||
      normalizedLongitude < -180 ||
      normalizedLongitude > 180
    ) {
      return res.status(400).json({ message: "Valid latitude and longitude are required" });
    }

    const duplicateFilter = [{ mobileNumber: normalizedMobileNumber }];
    if (normalizedEmail) duplicateFilter.push({ email: normalizedEmail });
    const existingUser = await User.findOne({ $or: duplicateFilter });
    if (existingUser) {
      return res.status(400).json({ message: "A user with this mobile number or email already exists" });
    }

    const user = await User.create({
      name: normalizedName,
      mobileNumber: normalizedMobileNumber,
      email: normalizedEmail || undefined,
      latitude: normalizedLatitude,
      longitude: normalizedLongitude,
    });

    return res.status(201).json({ message: "User added successfully", user });
  } catch (error) {
    console.error("Add admin user error:", error);
    return res.status(500).json({ message: "Failed to add user", error: error.message });
  }
};

exports.editAdminUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, mobileNumber, email, latitude, longitude } = req.body;
    const normalizedName = String(name || "").trim();
    const normalizedMobileNumber = String(mobileNumber || "").trim();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedLatitude = Number(latitude);
    const normalizedLongitude = Number(longitude);

    if (!normalizedName || !normalizedMobileNumber) {
      return res.status(400).json({ message: "User name and mobile number are required" });
    }
    if (
      !Number.isFinite(normalizedLatitude) ||
      normalizedLatitude < -90 ||
      normalizedLatitude > 90 ||
      !Number.isFinite(normalizedLongitude) ||
      normalizedLongitude < -180 ||
      normalizedLongitude > 180
    ) {
      return res.status(400).json({ message: "Valid latitude and longitude are required" });
    }

    const duplicateFilter = [{ mobileNumber: normalizedMobileNumber }];
    if (normalizedEmail) duplicateFilter.push({ email: normalizedEmail });
    const existingUser = await User.findOne({
      _id: { $ne: userId },
      $or: duplicateFilter,
    });
    if (existingUser) {
      return res.status(400).json({ message: "A user with this mobile number or email already exists" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        name: normalizedName,
        mobileNumber: normalizedMobileNumber,
        email: normalizedEmail || undefined,
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
      },
      { new: true, runValidators: true },
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    console.error("Edit admin user error:", error);
    return res.status(500).json({ message: "Failed to update user", error: error.message });
  }
};
