const reviewModel = require("../models/reviewModel");
const userModel = require("../models/userModel");

// 리뷰 작성 페이지 렌더링
exports.renderReviewForm = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { product: productCode, order: orderCode } = req.query;

  if (!productCode || !orderCode) {
    return res.send(
      "<script>alert('잘못된 접근입니다.'); history.back();</script>"
    );
  }

  try {
    const productInfo = await reviewModel.getProductForReview(productCode);

    if (!productInfo) {
      return res.send(
        "<script>alert('상품 정보가 없습니다.'); history.back();</script>"
      );
    }

    const product = {
      code: productCode,
      name: productInfo.name,
      image: productInfo.image,
    };

    res.render("mypage/review_form", {
      activeTab: "orders",
      product: product,
      orderCode: orderCode,
      mypage: { user: req.session.user },
    });
  } catch (err) {
    console.error("Render Review Form Error:", err);
    res
      .status(500)
      .send("<script>alert('오류가 발생했습니다.'); history.back();</script>");
  }
};

// 리뷰 저장 처리
exports.createReview = async (req, res) => {
  if (!req.session.user) return res.status(401).send("로그인이 필요합니다.");

  const { orderCode, productCode, rating, content, title } = req.body;
  const userCode = req.session.user.code || req.session.user.USER_CODE;
  const files = req.files;

  if (!title || title.trim() === "") {
    return res.send(
      "<script>alert('제목을 입력해주세요.'); history.back();</script>"
    );
  }
  if (!content || content.trim().length < 10) {
    return res.send(
      "<script>alert('내용은 최소 10자 이상 입력해주세요.'); history.back();</script>"
    );
  }

  const finalRating = rating ? parseInt(rating) : 0;

  try {
    await reviewModel.createReview(
      {
        productCode,
        userCode,
        title,
        rating: finalRating,
        content,
      },
      files
    );

    res.send(
      "<script>alert('리뷰가 등록되었습니다.'); location.href='/mypage/orders';</script>"
    );
  } catch (err) {
    console.error("Create Review Error:", err);
    res
      .status(500)
      .send(
        "<script>alert('리뷰 등록 중 오류가 발생했습니다.'); history.back();</script>"
      );
  }
};

// 리뷰 목록 페이지 렌더링
exports.renderReviewList = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const userCode = req.session.user.code || req.session.user.USER_CODE;

  try {
    let finalUserCode = userCode;
    if (!finalUserCode) {
      const user = await userModel.findUserById(req.session.user.id);
      finalUserCode = user.USER_CODE;
    }

    const reviews = await reviewModel.getUserReviews(finalUserCode);

    res.render("mypage/reviews", {
      activeTab: "reviews",
      mypage: {
        reviewCards: reviews,
        user: req.session.user,
      },
    });
  } catch (err) {
    console.error("Render Review List Error:", err);
    res.status(500).send("리뷰 목록을 불러오는 중 오류가 발생했습니다.");
  }
};

// 리뷰 삭제 처리
exports.deleteReview = async (req, res) => {
  if (!req.session.user)
    return res
      .status(401)
      .json({ success: false, message: "로그인이 필요합니다." });

  const { reviewCode } = req.body;
  const userCode = req.session.user.code || req.session.user.USER_CODE;

  try {
    await reviewModel.deleteReview(reviewCode, userCode);
    res.json({ success: true, message: "리뷰가 삭제되었습니다." });
  } catch (err) {
    console.error("Delete Review Error:", err);
    res
      .status(500)
      .json({ success: false, message: "리뷰 삭제 중 오류가 발생했습니다." });
  }
};

// [신규] 리뷰 수정 페이지 렌더링
exports.renderEditForm = async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const { id } = req.params; // reviewCode
  const userCode = req.session.user.code || req.session.user.USER_CODE;

  try {
    const review = await reviewModel.getReviewDetail(id, userCode);

    if (!review) {
      return res.send(
        "<script>alert('존재하지 않거나 권한이 없는 리뷰입니다.'); history.back();</script>"
      );
    }

    res.render("mypage/review_edit", {
      activeTab: "reviews",
      review: review,
      mypage: { user: req.session.user },
    });
  } catch (err) {
    console.error("Render Edit Form Error:", err);
    res
      .status(500)
      .send("<script>alert('오류가 발생했습니다.'); history.back();</script>");
  }
};

// [신규] 리뷰 수정 처리
exports.updateReview = async (req, res) => {
  if (!req.session.user) return res.status(401).send("로그인이 필요합니다.");

  const { id } = req.params;
  const { rating, content, title } = req.body;
  const userCode = req.session.user.code || req.session.user.USER_CODE;
  const files = req.files;

  if (!title || title.trim() === "") {
    return res.send(
      "<script>alert('제목을 입력해주세요.'); history.back();</script>"
    );
  }
  if (!content || content.trim().length < 10) {
    return res.send(
      "<script>alert('내용은 최소 10자 이상 입력해주세요.'); history.back();</script>"
    );
  }

  const finalRating = rating ? parseInt(rating) : 0;

  try {
    await reviewModel.updateReview(
      id,
      userCode,
      {
        title,
        rating: finalRating,
        content,
      },
      files
    );

    res.send(
      "<script>alert('리뷰가 수정되었습니다.'); location.href='/mypage/reviews';</script>"
    );
  } catch (err) {
    console.error("Update Review Error:", err);
    res
      .status(500)
      .send(
        "<script>alert('리뷰 수정 중 오류가 발생했습니다.'); history.back();</script>"
      );
  }
};
