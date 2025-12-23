const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");

// 장바구니 페이지 조회
// [수정] '/' -> '/cart'로 변경 (메인 페이지 '/' 와 충돌 방지)
router.get("/cart", cartController.renderCart);

// 장바구니 담기
// [수정] '/add' -> '/cart/add'로 변경
router.post("/cart/add", cartController.addToCart);

module.exports = router;
