const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const mypageController = require("../controllers/mypageController");
const claimController = require("../controllers/claimController");
const reviewController = require("../controllers/reviewController");
const { isLoggedIn } = require("../middleware/auth");

// --- Multer 설정 ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "public/images/reviews";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      "rev-" +
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
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use("/mypage", isLoggedIn);

// 주문 관련
router.get("/mypage/orders", mypageController.renderOrders);
router.get("/mypage/orders/detail/:id", mypageController.getOrderDetailApi);
router.get("/mypage/wishlist", mypageController.renderWishlist);
router.get("/mypage/coupons", mypageController.renderCoupons);
router.get("/mypage/profile", mypageController.renderProfile);

// 리뷰 관련
router.get("/mypage/reviews", reviewController.renderReviewList);
router.post("/mypage/reviews/delete", reviewController.deleteReview);
router.get("/mypage/reviews/write", reviewController.renderReviewForm);
router.post(
  "/mypage/reviews/write",
  upload.array("reviewImages", 3),
  reviewController.createReview
);

// [신규] 리뷰 수정 라우트
router.get("/mypage/reviews/edit/:id", reviewController.renderEditForm);
router.post(
  "/mypage/reviews/edit/:id",
  upload.array("reviewImages", 3),
  reviewController.updateReview
);

// 클레임 관련
router.get("/mypage/orders/claim/:id", claimController.renderClaimPage);
router.post("/mypage/orders/claim", claimController.processClaim);
router.post("/mypage/orders/cancel", mypageController.cancelOrder);

// 프로필 기능
router.post("/mypage/profile/update", mypageController.updateProfile);
router.post("/mypage/profile/withdraw", mypageController.withdraw);

module.exports = router;
