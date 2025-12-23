const reviewModel = require("../../models/reviewModel");

// 리뷰 관리 페이지 렌더링
exports.renderReviews = async (req, res) => {
  try {
    const { startDate, endDate, search, status } = req.query; // status 필터 추가 가능하도록 준비

    const today = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    const filter = {
      startDate: startDate || oneYearAgo.toISOString().split("T")[0],
      endDate: endDate || today.toISOString().split("T")[0],
      keyword: search || "",
    };

    const reviews = await reviewModel.getAllReviews(filter);

    res.render("admin/reviews", {
      active: "reviews",
      admin: { reviewTable: reviews },
      filters: filter,
    });
  } catch (err) {
    console.error("Admin Render Reviews Error:", err);
    res.status(500).send("오류가 발생했습니다.");
  }
};

// [신규] 리뷰 상세 정보 조회 API (모달용)
exports.getReviewDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const review = await reviewModel.getReviewDetailForAdmin(id);
    if (!review)
      return res
        .status(404)
        .json({ success: false, message: "리뷰를 찾을 수 없습니다." });
    res.json({ success: true, review });
  } catch (err) {
    console.error("Get Review Detail Error:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
};

// 리뷰 상태 변경 처리
exports.updateStatus = async (req, res) => {
  const { reviewCode, status } = req.body;

  if (!reviewCode || !status) {
    return res
      .status(400)
      .json({ success: false, message: "잘못된 요청입니다." });
  }

  try {
    await reviewModel.updateReviewStatus(reviewCode, status);
    res.json({ success: true, message: "상태가 변경되었습니다." });
  } catch (err) {
    console.error("Update Review Status Error:", err);
    res.status(500).json({ success: false, message: "상태 변경 실패" });
  }
};
