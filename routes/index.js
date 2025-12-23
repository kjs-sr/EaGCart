const express = require("express");
const router = express.Router();
const mainController = require("../controllers/mainController");
const productController = require("../controllers/productController");
const cartController = require("../controllers/cartController");
const couponController = require("../controllers/couponController");
const checkoutController = require("../controllers/checkoutController");

router.get("/", mainController.getHomePage);
router.get("/products", mainController.getProductsPage);
router.get("/product/detail", productController.renderDetail);
router.get(
  "/product/discount-history",
  productController.renderDiscountHistory
);
router.get("/api/search", productController.searchApi);
router.post("/product/wishlist/toggle", productController.toggleWishlist);

router.get("/api/product/stock", productController.getProductStockApi);

// 장바구니 관련
router.get("/cart", cartController.renderCart);
router.post("/cart/add", cartController.addToCart);
router.post("/cart/update", cartController.updateCartQty);
router.post("/cart/delete", cartController.deleteCartItem);
router.get("/cart/count", cartController.getCartCountApi);

// 쿠폰 존 관련
router.get("/coupons", couponController.renderCouponZone); // 쿠폰 페이지
router.post("/coupons/download", couponController.downloadCoupon); // 다운로드 API

// 결제 관련
router.get("/checkout", checkoutController.renderCheckout);
router.post("/checkout/process", checkoutController.processPayment);
router.get("/checkout/recent-address", checkoutController.getRecentAddress);

module.exports = router;
