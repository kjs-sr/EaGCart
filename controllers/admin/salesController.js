const salesModel = require("../../models/salesModel");
const productModel = require("../../models/productModel");
const scheduler = require("../../utils/scheduler");

// 판매 기록 페이지 (관리자용)
const renderSalesHistory = async (req, res) => {
  try {
    const { startDate, endDate, search, type, claim } = req.query; // [수정] claim 추가
    const today = new Date();

    // 기본 기간을 5년 전으로 설정 (전체 조회용)
    const longAgo = new Date();
    longAgo.setFullYear(today.getFullYear() - 5);

    const filters = {
      startDate: startDate || longAgo.toISOString().split("T")[0],
      endDate: endDate || today.toISOString().split("T")[0],
      keyword: search || "",
      onlyClaim: claim || "false", // [신규] 클레임 필터
    };
    const sales = await salesModel.getSalesList(filters);

    if (type === "json") {
      return res.json({ success: true, sales });
    }

    res.render("admin/sales-history", {
      active: "sales-history",
      admin: { sales },
      filters,
    });
  } catch (err) {
    console.error(err);
    if (req.query.type === "json") {
      res.json({ success: false, message: "Error" });
    } else {
      res.status(500).send("Error");
    }
  }
};

const getSalesDetail = async (req, res) => {
  const { id } = req.params;
  try {
    const items = await salesModel.getSalesDetail(id);
    res.json({ success: true, items });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error" });
  }
};

// 클레임(반품/교환) 처리 API
const processClaimItem = async (req, res) => {
  const { orderCode, productCode, action, qty, reason } = req.body;

  try {
    const product = await productModel.getProductByCode(productCode);
    const productName = product ? product.PRODUCT_NAME : "상품";

    if (action === "APPROVE_RETURN") {
      await salesModel.updateOrderItemStatus(
        orderCode,
        productCode,
        "RETURNED"
      );
      await salesModel.increaseProductStock(productCode, parseInt(qty));
      res.json({ success: true, message: "반품 승인 및 재고 복구 완료" });
    } else if (action === "APPROVE_EXCHANGE") {
      await salesModel.updateOrderItemStatus(
        orderCode,
        productCode,
        "EXCHANGED"
      );
      res.json({ success: true, message: "교환 승인 완료" });
    } else if (action === "REJECT") {
      await salesModel.updateOrderItemStatus(
        orderCode,
        productCode,
        "DELIVERED"
      );
      const userInfo = await salesModel.getUserEmailByOrder(orderCode);
      if (userInfo && userInfo.EMAIL) {
        scheduler
          .sendClaimRejectEmail(
            userInfo.EMAIL,
            userInfo.USER_NAME,
            productName,
            reason
          )
          .catch(console.error);
      }
      res.json({
        success: true,
        message: "요청이 거절되었으며, 안내 이메일이 발송되었습니다.",
      });
    } else {
      res.json({ success: false, message: "알 수 없는 동작입니다." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "처리 중 오류 발생" });
  }
};

const searchProductApi = async (req, res) => {
  const { q } = req.query;
  try {
    if (!q) return res.json({ success: true, products: [] });
    const products = await salesModel.searchProductsForAdmin(q);
    res.json({ success: true, products });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const renderSales = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      period,
      products,
      devices,
      categories,
      metrics,
    } = req.query;
    const today = new Date();
    const toYMD = (d) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const defaultEnd = toYMD(today);
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultStart = toYMD(firstDay);
    const toArray = (val) => (val ? (Array.isArray(val) ? val : [val]) : []);

    const filter = {
      startDate: startDate || defaultStart,
      endDate: endDate || defaultEnd,
      period: period || "day",
      products: toArray(products),
      devices: toArray(devices),
      categories: toArray(categories),
      metrics: toArray(metrics),
    };

    if (filter.metrics.length === 0 && !req.query.startDate) {
      filter.metrics = ["revenue"];
    }

    const stats = await salesModel.getSalesStats(filter);
    const deviceList = await productModel.getDevices();
    const categoryList = await productModel.getCategories();

    let selectedProducts = [];
    if (filter.products.length > 0) {
      for (const pCode of filter.products) {
        const p = await productModel.getProductByCode(pCode);
        if (p)
          selectedProducts.push({ code: p.PRODUCT_CODE, name: p.PRODUCT_NAME });
      }
    }

    res.render("admin/sales", {
      active: "sales",
      chartData: stats,
      filterLists: { devices: deviceList, categories: categoryList },
      currentFilters: { ...filter, selectedProducts },
    });
  } catch (err) {
    console.error("Render Sales Error:", err);
    res.status(500).send("오류가 발생했습니다.");
  }
};

const renderDashboard = async (req, res) => {
  try {
    const dashboardData = await salesModel.getDashboardOverview();
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, "0")}시 ${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}분 기준`;
    const currentMonth =
      parseInt(dashboardData.today.date.split(".")[1]) + "월 기준";
    const netData = dashboardData.charts.netProfit;
    const netValue = (netData.revenue || 0) - (netData.cost || 0);

    let profitClass = "text-slate-800";
    let profitText = netData.total + "원";

    if (netValue > 0) {
      profitClass = "text-emerald-500";
      profitText = "+" + netData.total + "원";
    } else if (netValue < 0) {
      profitClass = "text-rose-500";
      profitText = netData.total + "원";
    }

    const uiData = { timeString, currentMonth, profitClass, profitText };

    res.render("admin/dashboard", {
      active: "dashboard",
      admin: { dashboard: dashboardData, ui: uiData },
    });
  } catch (err) {
    console.error("Dashboard Render Error:", err);
    res
      .status(500)
      .send("Server Error: 대시보드 데이터를 불러오지 못했습니다.");
  }
};

module.exports = {
  renderSalesHistory,
  getSalesDetail,
  processClaimItem,
  renderSales,
  searchProductApi,
  renderDashboard,
};
