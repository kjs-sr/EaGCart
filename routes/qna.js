const express = require("express");
const router = express.Router();
const qnaController = require("../controllers/qnaController");

// 문의 메인
router.get("/qna", qnaController.renderLanding);

// 문의 작성
router.get("/qna/write", qnaController.renderWrite);
router.post("/qna/write", qnaController.createInquiry); // [신규] 등록 처리

// 문의 내역
router.get("/qna/history", qnaController.renderHistory);

module.exports = router;
