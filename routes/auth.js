const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// 페이지 렌더링
router.get("/login", authController.renderLogin);
router.get("/register", authController.renderRegister);
router.get("/account/recovery", authController.renderRecovery);
router.get("/logout", authController.logout);

// API & Action
router.post("/auth/send-verification", authController.sendVerificationCode); // 이메일 발송
router.post("/auth/verify-code", authController.verifyCode); // 인증번호 확인
router.post("/auth/check-duplicate", authController.checkDuplicate); // 중복 확인

router.post("/auth/register", authController.register); // 회원가입 제출
router.post("/auth/login", authController.login); // 로그인 제출
router.post("/auth/find-id", authController.findId); // 아이디 찾기 제출
router.post("/auth/find-pw", authController.findPw); // 비번 찾기 제출

module.exports = router;
