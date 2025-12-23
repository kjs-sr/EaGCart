// controllers/admin/uiController.js

// 1. 대시보드 렌더링
exports.renderDashboard = (req, res) => {
  const dashboardData = {
    // 1) 상단 "오늘" 요약 데이터
    today: {
      date: new Date().toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      }),
      orderCount: 1,
      revenue: "87,500",
      pendingDelivery: 1,
      stockAlert: 0,
      pendingInquiry: 1,
    },

    // 2) 하단 차트용 데이터
    charts: {
      // (1) 순이익 (가로 막대 차트용)
      netProfit: {
        total: "1,982,100", // 순이익 총액
        revenue: 6370000, // 매출액 (그래프용 수치)
        cost: 4390000, // 매출원가 (그래프용 수치)
      },
      // (2) 기기별 판매량 (도넛 차트)
      devices: {
        labels: ["Nintendo Switch", "PS5"],
        data: [60, 40], // 퍼센트 또는 수량
      },
      // (3) 카테고리별 판매량 (도넛 차트)
      categories: {
        labels: ["액션", "RPG", "스포츠", "시뮬레이션", "기타"],
        data: [35, 25, 20, 10, 10],
      },
    },
  };

  res.render("admin/dashboard", {
    active: "dashboard",
    admin: {
      dashboard: dashboardData,
    },
  });
};

// --- 이하 다른 관리자 페이지 (준비중) ---
exports.renderSales = (req, res) => {
  res.send("매출 관리 (준비중)");
};
exports.renderSalesHistory = (req, res) => {
  res.send("매출 내역 (준비중)");
};

exports.renderDelivery = (req, res) => {
  res.send("배송 관리 (준비중)");
};

exports.renderReviews = (req, res) => {
  res.send("리뷰 관리 (준비중)");
};
exports.renderInquiries = (req, res) => {
  res.send("문의 관리 (준비중)");
};
exports.renderDiscount = (req, res) => {
  res.render("admin/discount", {
    active: "discount",
  });
};
exports.renderCoupon = (req, res) => {
  res.send("쿠폰 관리 (준비중)");
};
