const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const adminBannerController = require("../controllers/admin/bannerController");
const adminUiController = require("../controllers/admin/uiController");
const adminProductController = require("../controllers/admin/productController");
const adminDiscountController = require("../controllers/admin/discountController");
const adminInventoryController = require("../controllers/admin/inventoryController");
const adminUserController = require("../controllers/admin/userController");
const adminInquiryController = require("../controllers/admin/inquiryController");
const adminCouponController = require("../controllers/admin/couponController");
const adminDeliveryController = require("../controllers/admin/deliveryController");
const adminReviewController = require("../controllers/admin/adminReviewController");
const adminSalesController = require("../controllers/admin/salesController"); // 통합된 컨트롤러 사용
const { isAdmin } = require("../middleware/auth");

router.use(isAdmin);

// --- Multer 설정 (수정됨) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let dir = "public/images/temp"; // 기본값 (임시 폴더)

    // 요청 URL에 따라 저장 폴더 분기
    if (req.originalUrl.includes("/product")) {
      dir = "public/images/products";
    }
    // [수정] 배너 관련 요청 중 'upload'(임시저장)가 아닐 때만 banner 폴더로 지정
    // 즉, /banner/upload 요청은 기본값인 'public/images/temp'로 저장되어야 함
    else if (
      req.originalUrl.includes("/banner") &&
      !req.originalUrl.includes("/upload")
    ) {
      dir = "public/images/banner";
    }

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const prefix = req.originalUrl.includes("/product") ? "prod-" : "banner-";
    cb(
      null,
      prefix +
        Date.now() +
        "-" +
        Math.round(Math.random() * 1e9) +
        path.extname(file.originalname)
    );
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    cb(null, true);
  } else {
    cb(new Error("이미지 파일(JPG, PNG)만 업로드 가능합니다."), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// --- 라우팅 (기존 코드 유지) ---
router.get("/", adminUiController.renderDashboard);

router.get("/dashboard", adminSalesController.renderDashboard);

// 매출 통계
router.get("/sales", adminSalesController.renderSales);
router.get("/sales/product-search", adminSalesController.searchProductApi); // [신규]

// [수정] 판매 기록 (주문 내역)
router.get("/sales-history", adminSalesController.renderSalesHistory);
router.get("/sales-history/detail/:id", adminSalesController.getSalesDetail); // [신규] 상세 조회
router.post("/sales-history/claim", adminSalesController.processClaimItem);

// 뷰 관리 (새 컨트롤러 연결)
router.get("/reviews", adminReviewController.renderReviews);
router.get("/reviews/detail/:id", adminReviewController.getReviewDetail);
router.post("/reviews/update", adminReviewController.updateStatus);

// 배송 관리
router.get("/delivery", adminDeliveryController.renderDelivery);
router.get("/delivery/detail/:id", adminDeliveryController.getDeliveryDetail);
router.post("/delivery/update", adminDeliveryController.updateStatus);

// 회원 관리 라우트
router.get("/users", adminUserController.listUsers);
router.post("/users/update", adminUserController.updateUserStatus); // 상태 업데이트 API

// 상품 관리 라우트
router.get("/products", adminProductController.listProducts); // 목록 조회
router.get("/products/new", adminProductController.renderCreatePage); // 등록 페이지
router.post(
  "/products/new",
  upload.array("productImages", 5),
  adminProductController.createProduct
); // 등록 처리 (최대 5장)
// 상품 수정 라우트
router.get("/products/edit/:id", adminProductController.renderEditPage);
router.post(
  "/products/edit/:id",
  upload.array("productImages", 5),
  adminProductController.updateProduct
);

// 재고 관리
router.get("/inventory", adminInventoryController.renderInventory);
router.post(
  "/inventory/calculate-optimal",
  adminInventoryController.calculateOptimalStock
);
router.post("/inventory/update", adminInventoryController.updateStock);
router.post("/inventory/inbound", adminInventoryController.addInbound);
router.get(
  "/inventory/history",
  adminInventoryController.getInboundHistoryList
);

// --- 태그 관리 API (AJAX용) ---
router.get("/products/tags", adminProductController.getTags); // 태그 목록 조회
router.post("/products/tags", adminProductController.addTag); // 태그 추가
router.put("/products/tags", adminProductController.updateTag); // 태그 수정
router.delete("/products/tags", adminProductController.deleteTag); // 태그 삭제
router.get("/products/search", adminProductController.searchProductApi); // 검색 API

// 배너 관리 라우트
router.get("/banner", adminBannerController.getBannerManagePage);
router.post(
  "/banner/upload",
  upload.single("bannerImage"),
  adminBannerController.uploadBannerTemp
);
router.post("/banner/save", adminBannerController.saveAllBanners);

// 할인 관리
router.get("/discount", adminDiscountController.renderDiscount);
router.post("/discount/new", adminDiscountController.createDiscount);
router.get("/discount/detail/:id", adminDiscountController.getDiscountDetail);
router.post("/discount/update", adminDiscountController.updateDiscount);

// 문의 관리 라우트
router.get("/inquiries", adminInquiryController.renderInquiries); // 목록 페이지
router.get("/inquiries/detail/:id", adminInquiryController.getInquiryDetail); // 상세 조회 API
router.post("/inquiries/answer", adminInquiryController.saveAnswer); // 답변 등록 API

// 쿠폰 관리 라우트
router.get("/coupon", adminCouponController.renderCoupon);
router.post("/coupon/new", adminCouponController.createCoupon);
router.get("/coupon/detail/:id", adminCouponController.getCouponDetail);
router.post("/coupon/update", adminCouponController.updateCoupon);

module.exports = router;
