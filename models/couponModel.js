const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 쿠폰 목록 조회 (관리자용)
async function getCouponList() {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        COUPON_CODE, 
        COUPON_NAME, 
        DISCOUNT_AMOUNT, 
        DISCOUNT_RATE, 
        MAX_DISCOUNT_AMOUNT,
        TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
        TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
        STATUS
      FROM EaGCart_Coupons
      ORDER BY START_DATE DESC, COUPON_CODE DESC
    `;

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows.map((row) => {
      let status = row.STATUS;
      const today = new Date().toISOString().split("T")[0];

      if (today < row.START_DATE) status = "예정";
      else if (today > row.END_DATE) status = "종료";
      else if (status === "ACTIVE") status = "진행중";

      return {
        code: row.COUPON_CODE,
        name: row.COUPON_NAME,
        type: row.DISCOUNT_RATE ? "RATE" : "AMOUNT",
        value: row.DISCOUNT_RATE
          ? row.DISCOUNT_RATE + "%"
          : row.DISCOUNT_AMOUNT.toLocaleString() + "원",
        limit: row.MAX_DISCOUNT_AMOUNT
          ? row.MAX_DISCOUNT_AMOUNT.toLocaleString() + "원"
          : "-",
        startDate: row.START_DATE,
        endDate: row.END_DATE,
        status: status,
      };
    });
  } finally {
    if (connection) await connection.close();
  }
}

// 2. 쿠폰 생성 (관리자용)
async function createCoupon(data) {
  let connection;
  try {
    connection = await db.getConnection();
    const couponCode = "CP" + Date.now();
    const sql = `
      INSERT INTO EaGCart_Coupons (
        COUPON_CODE, COUPON_NAME, COUPON_DESCRIPTION, 
        DISCOUNT_AMOUNT, DISCOUNT_RATE, MAX_DISCOUNT_AMOUNT, 
        START_DATE, END_DATE, STATUS
      ) VALUES (
        :couponCode, :couponName, :couponDesc, 
        :discountAmount, :discountRate, :maxDiscount, 
        TO_DATE(:startDateStr, 'YYYY-MM-DD'), TO_DATE(:endDateStr, 'YYYY-MM-DD'), 
        'ACTIVE'
      )
    `;

    const amount = data.type === "AMOUNT" ? parseInt(data.value) : null;
    const rate = data.type === "RATE" ? parseInt(data.value) : null;
    const maxAmount = data.type === "RATE" ? parseInt(data.maxDiscount) : null;

    await connection.execute(
      sql,
      {
        couponCode: couponCode,
        couponName: data.name,
        couponDesc: data.description,
        discountAmount: amount,
        discountRate: rate,
        maxDiscount: maxAmount,
        startDateStr: data.startDate,
        endDateStr: data.endDate,
      },
      { autoCommit: true }
    );

    return true;
  } finally {
    if (connection) await connection.close();
  }
}

// 3. 쿠폰 상세 조회 (관리자용)
async function getCouponDetail(code) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        COUPON_CODE, COUPON_NAME, COUPON_DESCRIPTION,
        DISCOUNT_AMOUNT, DISCOUNT_RATE, MAX_DISCOUNT_AMOUNT,
        TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE,
        TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
        STATUS
      FROM EaGCart_Coupons
      WHERE COUPON_CODE = :couponCode
    `;
    const result = await connection.execute(
      sql,
      { couponCode: code },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return result.rows[0];
  } finally {
    if (connection) await connection.close();
  }
}

// 4. 쿠폰 수정 (관리자용)
async function updateCoupon(data) {
  let connection;
  try {
    connection = await db.getConnection();
    const amount = data.type === "AMOUNT" ? parseInt(data.value) : null;
    const rate = data.type === "RATE" ? parseInt(data.value) : null;
    const maxAmount = data.type === "RATE" ? parseInt(data.maxDiscount) : null;

    const sql = `
      UPDATE EaGCart_Coupons
      SET COUPON_NAME = :couponName,
          COUPON_DESCRIPTION = :couponDesc,
          DISCOUNT_AMOUNT = :discountAmount,
          DISCOUNT_RATE = :discountRate,
          MAX_DISCOUNT_AMOUNT = :maxDiscount,
          START_DATE = TO_DATE(:startDateStr, 'YYYY-MM-DD'),
          END_DATE = TO_DATE(:endDateStr, 'YYYY-MM-DD'),
          STATUS = :couponStatus
      WHERE COUPON_CODE = :couponCode
    `;

    await connection.execute(
      sql,
      {
        couponName: data.name,
        couponDesc: data.description,
        discountAmount: amount,
        discountRate: rate,
        maxDiscount: maxAmount,
        startDateStr: data.startDate,
        endDateStr: data.endDate,
        couponStatus: data.status,
        couponCode: data.code,
      },
      { autoCommit: true }
    );

    return true;
  } finally {
    if (connection) await connection.close();
  }
}

// [신규] 사용자용: 진행 중인 쿠폰 목록 조회 (보유 여부 포함)
async function getAvailableCoupons(userCode) {
  let connection;
  try {
    connection = await db.getConnection();

    // 현재 날짜 기준 유효하고 상태가 ACTIVE인 쿠폰 조회
    const sql = `
      SELECT 
        C.COUPON_CODE, 
        C.COUPON_NAME, 
        C.COUPON_DESCRIPTION,
        C.DISCOUNT_AMOUNT, 
        C.DISCOUNT_RATE, 
        C.MAX_DISCOUNT_AMOUNT,
        TO_CHAR(C.START_DATE, 'YYYY-MM-DD') AS START_DATE,
        TO_CHAR(C.END_DATE, 'YYYY-MM-DD') AS END_DATE,
        CASE WHEN UC.COUPON_CODE IS NOT NULL THEN 1 ELSE 0 END AS HAS_COUPON
      FROM EaGCart_Coupons C
      LEFT JOIN EaGCart_User_Coupons UC 
        ON C.COUPON_CODE = UC.COUPON_CODE 
        AND UC.USER_CODE = :uCode
      WHERE C.STATUS = 'ACTIVE'
        AND TRUNC(SYSDATE) BETWEEN TRUNC(C.START_DATE) AND TRUNC(C.END_DATE)
      ORDER BY C.END_DATE ASC, C.COUPON_CODE DESC
    `;

    const result = await connection.execute(
      sql,
      { uCode: userCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows.map((row) => ({
      code: row.COUPON_CODE,
      name: row.COUPON_NAME,
      desc: row.COUPON_DESCRIPTION,
      type: row.DISCOUNT_RATE ? "RATE" : "AMOUNT",
      value: row.DISCOUNT_RATE
        ? row.DISCOUNT_RATE + "%"
        : row.DISCOUNT_AMOUNT.toLocaleString() + "원",
      minPrice: row.MAX_DISCOUNT_AMOUNT
        ? `최대 ${row.MAX_DISCOUNT_AMOUNT.toLocaleString()}원 할인`
        : "",
      startDate: row.START_DATE,
      endDate: row.END_DATE,
      hasCoupon: row.HAS_COUPON === 1,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// [신규] 사용자용: 쿠폰 발급 (중복 체크 및 STATUS 추가)
async function issueCouponToUser(userCode, couponCode) {
  let connection;
  try {
    connection = await db.getConnection();

    // 1. 이미 보유 중인지 확인
    const checkSql = `SELECT 1 FROM EaGCart_User_Coupons WHERE USER_CODE = :uCode AND COUPON_CODE = :cCode`;
    const checkResult = await connection.execute(checkSql, {
      uCode: userCode,
      cCode: couponCode,
    });

    if (checkResult.rows.length > 0) {
      return { success: false, message: "이미 보유하고 있는 쿠폰입니다." };
    }

    // 2. 쿠폰 유효성 재확인 (기간 및 상태)
    const validSql = `
      SELECT 1 FROM EaGCart_Coupons 
      WHERE COUPON_CODE = :cCode 
        AND STATUS = 'ACTIVE' 
        AND TRUNC(SYSDATE) BETWEEN TRUNC(START_DATE) AND TRUNC(END_DATE)
    `;
    const validResult = await connection.execute(validSql, {
      cCode: couponCode,
    });

    if (validResult.rows.length === 0) {
      return { success: false, message: "유효하지 않거나 만료된 쿠폰입니다." };
    }

    // 3. 발급 (INSERT - STATUS 'UNUSED' 추가)
    // [수정] STATUS 컬럼에 'UNUSED' 값 추가
    const insertSql = `
      INSERT INTO EaGCart_User_Coupons (USER_CODE, COUPON_CODE, STATUS) 
      VALUES (:uCode, :cCode, 'UNUSED')
    `;
    await connection.execute(
      insertSql,
      { uCode: userCode, cCode: couponCode },
      { autoCommit: true }
    );

    return { success: true, message: "쿠폰이 발급되었습니다." };
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  getCouponList,
  createCoupon,
  getCouponDetail,
  updateCoupon,
  getAvailableCoupons,
  issueCouponToUser,
};
