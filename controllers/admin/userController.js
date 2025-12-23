const userModel = require("../../models/userModel");

// 회원 목록 페이지 렌더링
exports.listUsers = async (req, res) => {
  try {
    const users = await userModel.getUserList();
    res.render("admin/users", { active: "users", admin: { userList: users } });
  } catch (err) {
    console.error(err);
    res.status(500).send("회원 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// [추가] 회원 상태 업데이트 (AJAX)
exports.updateUserStatus = async (req, res) => {
  const { userId, status, banReason } = req.body;

  try {
    // 유효성 검사 (간단히)
    if (!userId || !status) {
      return res
        .status(400)
        .json({ success: false, message: "필수 정보가 누락되었습니다." });
    }

    await userModel.updateUserStatus(userId, status, banReason);

    res.json({ success: true, message: "회원 상태가 변경되었습니다." });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "상태 변경 중 오류가 발생했습니다." });
  }
};
