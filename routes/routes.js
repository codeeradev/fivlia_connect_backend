const express = require("express");
const upload = require("../middleware/multer");
const router = express.Router();

const verifyToken = require("../middleware/authToken"); // Optional, if needed
const verifyAdminToken = require("../middleware/adminAuth");

const {
  saveCategory,
  getCategories,
  saveSubEntity,
  deleteEntity,
  toggleStatus,
  getFilters
} = require("../controlers/categoryControler");
const {
  banner,
  getBanner,
  getAllBanner,
  updateBannerStatus,
  updateBannerApproval,
  addPlans,
  editPlans,
  getPlans,
  deleteBanner
} = require("../controlers/bannerControler");

const { saveLocation, getCity } = require("../controlers/locationControler");
const {
  adminSetting,
  adminLogin,
  getAdminSetting,
  getAppSetting,
  getAdminDashboard,
  createNotification,
  editNotification,
  getNotifications,
  deleteNotificationAdmin,
  sendNotification,
  addAdminBanner,
  addFilter,
  editFilter,
  deleteFilter,
  getAllFilters,
  getHelpForms,
  updateHelpFormStatus,
} = require("../controlers/adminControler");

// ---------------- AUTH ROUTES ----------------
const {
  register,
  login,
  verifyOtp,
  getUsers,
  addAdminUser,
  editAdminUser,
  getProfile,
  updateFcmToken,
  editProfile,
  planRenewal,
  sendChatNotification,
  deleteNotification,
  getUserNotifications,
  contactUsForm
} = require("../controlers/authControler");
const {
  addProduct,
  addAdminProduct,
  getProduct,
  getPublicListing,
  updateProductStatus,
  editProduct,
  repostProduct,
  repostAdminProduct,
  getProductForApprovals,
  rateProduct,
  deleteProduct,
  deleteAdminProduct,
  getUserCategoryWiseProducts,
  getUserProducts,
} = require("../controlers/productControler");

router.post("/register", upload, register);
router.post("/login", login);
router.post("/verify-otp", verifyOtp);
router.post("/admin/login", adminLogin);
router.post("/update-fcm-token", verifyToken, updateFcmToken);
router.post("/edit-profile", upload, verifyToken, editProfile);
router.post("/plan-renewal", verifyToken, planRenewal);
router.post("/send-chat-notification", sendChatNotification);

router.post("/admin/update-setting", upload, adminSetting);
router.post("/admin/addBanner", verifyAdminToken, upload, addAdminBanner);
router.post("/admin/add-filter", verifyAdminToken, addFilter);
router.post("/admin/edit-filter/:id", verifyAdminToken, editFilter);
router.delete("/admin/delete-filter/:id", verifyAdminToken, deleteFilter);
router.get("/admin/get-all-filters", verifyAdminToken, getAllFilters);

router.post("/save-location", verifyToken, saveLocation);
router.get("/get-city", getCity);
router.get("/getUsers", getUsers);
router.post("/admin/add-user", verifyAdminToken, addAdminUser);
router.post("/admin/edit-user/:userId", verifyAdminToken, editAdminUser);
router.get("/getProfile", verifyToken, getProfile);
// ---------------- CATEGORY ROUTES ----------------

// Create or Update Category
router.post("/saveCategory", upload, saveCategory);

// Get All or Single Category (⚠️ same response structure kept)
router.get("/getCategories", getCategories);

// ---------------- SUB CATEGORY ROUTES ----------------
// Add or Update Subcategory
router.post("/saveSubEntity/:catId", upload, saveSubEntity);

// ---------------- DELETE ROUTE ----------------
// Delete Category / Subcategory (based on params)
router.delete("/deleteEntity/:catId", deleteEntity);

// ---------------- STATUS TOGGLE ----------------
// Toggle Category/Sub Status
router.patch("/toggleStatus/:catId", toggleStatus);
router.get("/get-filters", getFilters);

// ---------------- PRODUCT ROUTES ----------------
router.post("/addProduct", upload, verifyToken, addProduct);
router.post("/admin/addProduct", verifyAdminToken, upload, addAdminProduct);
router.get("/getProduct", getProduct);
router.get("/get-public-listing", verifyToken, getPublicListing);
router.post("/update-product-status/:productId", verifyAdminToken, updateProductStatus);
router.post("/edit-product/:productId", upload, editProduct);
router.post("/repost-product/:productId", upload, repostProduct);
router.post("/admin/repost-product/:productId", verifyAdminToken, repostAdminProduct);
router.get("/get-product-for-approvals", verifyAdminToken, getProductForApprovals);
router.get("/get-user-category-wise-products", verifyToken, getUserCategoryWiseProducts);
router.get("/get-user-products/:bannerId", getUserProducts);
router.post("/rate-product/:productId", verifyToken, rateProduct);
router.delete("/delete-product/:productId", verifyToken, deleteProduct);
router.delete("/admin/delete-product/:productId", verifyAdminToken, deleteAdminProduct);
// ---------------- BANNER ROUTES ----------------
// Add or Update BANNER
router.post("/addBanner", verifyToken, upload, banner);
router.put("/update-banner-status/:id", upload, updateBannerStatus);
router.post("/update-banner-approval/:id", verifyAdminToken, updateBannerApproval);
router.post("/addPlans", addPlans);
router.post("/edit-elans/:planId", editPlans);
router.get("/getPlans", getPlans);
router.get("/delete-banner/:bannerId", verifyToken, deleteBanner);

router.get("/getBanner", verifyToken, getBanner);
router.get("/get-all-banner", verifyAdminToken, getAllBanner);

router.get("/admin/get-setting", getAdminSetting);
router.get("/admin/dashboard", verifyAdminToken, getAdminDashboard);
router.get("/get-app-setting", getAppSetting);

router.post("/create-notification", upload, createNotification);
router.post("/edit-notification/:id", upload, editNotification);
router.get("/get-notification", getNotifications);
router.delete("/delete-notification/:id", verifyAdminToken, deleteNotificationAdmin);
router.post("/send-notification", sendNotification);

router.post("/delete-notification", verifyToken, deleteNotification)

router.get("/get-user-notification", verifyToken, getUserNotifications);

router.post("/contact-us", verifyToken, contactUsForm);
router.get("/admin/get-help-forms", verifyAdminToken, getHelpForms);
router.patch(
  "/admin/update-help-form-status/:id",
  verifyAdminToken,
  updateHelpFormStatus,
);
module.exports = router;
