const inquiryModel = require("../../models/inquiryModel");

// 문의 관리 페이지 렌더링
exports.renderInquiries = async (req, res) => {
  try {
    const inquiries = await inquiryModel.getInquiryList();

    res.render("admin/inquiries", {
      active: "inquiries",
      admin: { inquiryTable: inquiries },
    });
  } catch (err) {
    console.error("Admin Inquiry Render Error:", err);
    res.status(500).send("문의 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// 문의 상세 조회 API (모달용)
exports.getInquiryDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const inquiry = await inquiryModel.getInquiryDetail(id);
    if (!inquiry)
      return res
        .status(404)
        .json({ success: false, message: "문의를 찾을 수 없습니다." });

    res.json({ success: true, inquiry });
  } catch (err) {
    console.error("Get Inquiry Detail Error:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
};

// 답변 등록 API
exports.saveAnswer = async (req, res) => {
  const { code, answer } = req.body;

  if (!code || !answer) {
    return res
      .status(400)
      .json({ success: false, message: "답변 내용을 입력해주세요." });
  }

  try {
    await inquiryModel.updateAnswer(code, answer);
    res.json({ success: true, message: "답변이 등록되었습니다." });
  } catch (err) {
    console.error("Save Answer Error:", err);
    res.status(500).json({ success: false, message: "답변 등록 실패" });
  }
};
