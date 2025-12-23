// 관리자 권한 체크 미들웨어
exports.isAdmin = (req, res, next) => {
  // 1. 로그인 여부 확인
  if (!req.session.user) {
    return res
      .status(401)
      .send(
        "<script>alert('로그인이 필요합니다.'); location.href='/login';</script>"
      );
  }

  // 2. 관리자 권한 확인 (STATUS가 'ADMIN'인지)
  if (req.session.user.status !== "ADMIN") {
    return res
      .status(403)
      .send(
        "<script>alert('잘못된 요청입니다. (관리자 권한 필요)'); location.href='/';</script>"
      );
  }

  // 3. 통과 시 다음 미들웨어/컨트롤러 실행
  next();
};

// 로그인 여부만 체크하는 미들웨어 (필요 시 사용)
exports.isLoggedIn = (req, res, next) => {
  if (!req.session.user) {
    return res
      .status(401)
      .send(
        "<script>alert('로그인이 필요합니다.'); location.href='/login';</script>"
      );
  }
  next();
};
