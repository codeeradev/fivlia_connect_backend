const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: String,
    image: [String],
    description: String,
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    subCategory: { type: mongoose.Schema.Types.ObjectId },
    status: { type: Boolean, default: true },
    price: Number,
    address: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    productType:[String],
    productStatus: {
      type: String,
      default: "pending",
      enum: ["pending", "rejected", "active", "sold", "expired"],
    },
    paymentType:{ type: String, enum: ["free", "paid"] },
    transactionId: String,
    selectedPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "product_plan",
    },
    rating: { type: Number, default: 0 }, // average rating
    ratingCount: { type: Number, default: 0 },
    ratingSum: { type: Number, default: 0 },
    latitude: Number,
    longitude: Number,
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    expiresAt: { type: Date },
    addedBy:{type:Boolean, default: false},
    expiryDays: { type: Number, default: 90 },
  },
  { timestamps: true },
);

productSchema.pre("save", function (next) {
  const latitude = Number(this.latitude);
  const longitude = Number(this.longitude);
  const hasValidCoordinates =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  if (hasValidCoordinates) {
    this.location = {
      type: "Point",
      coordinates: [longitude, latitude],
    };
  } else {
    // The 2dsphere index rejects an incomplete GeoJSON Point. Admin-created
    // products have no coordinates, so omit the location field entirely.
    this.set("location", undefined);
  }

  // Only assign expiry when product becomes ACTIVE
  if (this.isModified("productStatus") && this.productStatus === "active") {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + this.expiryDays);
    this.expiresAt = expiry;
  }
  next();
});

productSchema.methods.resetExpiry = function () {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + this.expiryDays);
  this.expiresAt = expiry;
};

module.exports = mongoose.model("product", productSchema);
