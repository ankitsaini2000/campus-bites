const mongoose = require("mongoose");

/**
 * Promotional discount code.
 *
 * A promo defines exactly one discount: either `percentOff`
 * (1-100) or `fixedOff` (rupees off). The model enforces that
 * invariant on validate so a code can never be both or neither.
 */
const promoSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 30,
      index: true,
    },
    description: { type: String, trim: true, maxlength: 200, default: "" },

    // Exactly one of these is set (enforced below and on the route).
    percentOff: { type: Number, min: 1, max: 100, default: null },
    fixedOff: { type: Number, min: 0, max: 100000, default: null },

    // Minimum cart subtotal the code applies to.
    minSubtotal: { type: Number, min: 0, default: 0 },
    // Usage ceiling. `null` means unlimited.
    maxUses: { type: Number, min: 1, default: null },
    usedCount: { type: Number, min: 0, default: 0 },

    active: { type: Boolean, default: true },
    validFrom: { type: Date, default: Date.now },
    validUntil: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

/**
 * A code must carry exactly one discount type.
 *
 * Mongoose 9 middleware is promise-based: hooks receive NO
 * `next` argument (the codebase's User.pre("save") follows the
 * same async style). Calling `next()` here would throw
 * "next is not a function" on every create.
 */
promoSchema.pre("validate", async function () {
  const hasPercent = this.percentOff != null;
  const hasFixed = this.fixedOff != null;
  if (hasPercent === hasFixed) {
    this.invalidate(
      "discount",
      "A promo code must define exactly one of percentOff or fixedOff"
    );
  }
});

promoSchema.index({ active: 1 });

/**
 * Decide whether `promo` may be applied to a cart of `subtotal`.
 *
 * Pure function of its inputs (no `this`), shared by the validation
 * endpoint and the order-placement route so both always agree.
 *
 * Returns `{ valid: true, discount }` or `{ valid: false, message }`.
 */
promoSchema.statics.evaluate = function (promo, subtotal, now = new Date()) {
  if (!promo) {
    return { valid: false, message: "Unknown promo code" };
  }
  if (promo.active !== true) {
    return { valid: false, message: "Promo code is not active" };
  }
  const at = now instanceof Date ? now : new Date(now);
  if (promo.validFrom && new Date(promo.validFrom).getTime() > at.getTime()) {
    return { valid: false, message: "Promo code is not valid yet" };
  }
  if (promo.validUntil && new Date(promo.validUntil).getTime() < at.getTime()) {
    return { valid: false, message: "Promo code has expired" };
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    return { valid: false, message: "Promo code usage limit reached" };
  }
  if (subtotal < (promo.minSubtotal || 0)) {
    return {
      valid: false,
      message: `Promo code requires a subtotal of at least ₹${promo.minSubtotal}`,
    };
  }

  const discount =
    promo.percentOff != null
      ? Math.round((subtotal * promo.percentOff) / 100)
      : Math.min(promo.fixedOff || 0, subtotal);

  return { valid: true, discount: Math.max(0, Math.round(discount * 100) / 100) };
};

const PromoCode = mongoose.model("PromoCode", promoSchema);

module.exports = PromoCode;
