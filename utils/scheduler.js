const schedule = require("node-cron");
const nodemailer = require("nodemailer");
const db = require("../config/db");
const oracledb = require("oracledb");

// --- 1. 이메일 전송 설정 ---
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

async function sendEmail(to, subject, htmlContent) {
  try {
    await transporter.sendMail({
      from: `"EaGCart 알림" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: htmlContent,
    });
    console.log(`[Email Sent] To: ${to}, Subject: ${subject}`);
  } catch (error) {
    console.error(`[Email Error] To: ${to} 실패:`, error);
  }
}

// ============================================================
// [Part 1] 스케줄러: 매일 자정 실행 (쿠폰 삭제)
// ============================================================
schedule.schedule("0 0 0 * * *", async () => {
  console.log(
    "=== [일일 스케줄러] 쿠폰 정리 시작 ===",
    new Date().toLocaleString()
  );
  let connection;
  try {
    connection = await db.getConnection();

    // 유효기간(END_DATE)이 어제부로 끝난 쿠폰 삭제
    const deleteCouponSql = `
      DELETE FROM EaGCart_User_Coupons UC
      WHERE EXISTS (
        SELECT 1 FROM EaGCart_Coupons C
        WHERE UC.COUPON_CODE = C.COUPON_CODE
          AND C.END_DATE < TRUNC(SYSDATE)
      )
    `;
    const result = await connection.execute(deleteCouponSql, [], {
      autoCommit: true,
    });
    console.log(`[쿠폰 정리] 만료된 쿠폰 ${result.rowsAffected}건 삭제 완료.`);
  } catch (err) {
    console.error("스케줄러 실행 중 오류:", err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
});

// ============================================================
// [Part 2] 이벤트 기반 알림 함수
// ============================================================

/**
 * 1. 할인 알림
 */
async function sendDiscountAlert(productCodes) {
  const codes = Array.isArray(productCodes) ? productCodes : [productCodes];
  if (codes.length === 0) return;

  let connection;
  try {
    connection = await db.getConnection();

    for (const code of codes) {
      const sql = `
          SELECT M.EMAIL, M.USER_NAME, P.PRODUCT_NAME, D.DISCOUNT_RATE, D.DISCOUNT_PRICE
          FROM EaGCart_Wishlists W
          JOIN EaGCart_Members M ON W.USER_CODE = M.USER_CODE
          JOIN EaGCart_Products P ON W.PRODUCT_CODE = P.PRODUCT_CODE
          JOIN EaGCart_Discounts D ON P.PRODUCT_CODE = D.PRODUCT_CODE
          WHERE P.PRODUCT_CODE = :code
            AND D.STATUS = '진행중'
            AND TRUNC(SYSDATE) BETWEEN TRUNC(D.START_DATE) AND TRUNC(D.END_DATE)
        `;

      const result = await connection.execute(
        sql,
        { code: code },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (result.rows.length === 0) continue;

      const productInfo = result.rows[0];
      const discountText = productInfo.DISCOUNT_RATE
        ? `${productInfo.DISCOUNT_RATE}%`
        : "특가";

      console.log(
        `[할인 알림] 상품(${productInfo.PRODUCT_NAME}) 대상 유저 ${result.rows.length}명에게 발송.`
      );

      for (const row of result.rows) {
        if (!row.EMAIL) continue;
        const subject = `[EaGCart] 찜하신 '${row.PRODUCT_NAME}' 상품 할인이 시작되었습니다!`;
        const content = `
            <h3>안녕하세요, ${row.USER_NAME}님!</h3>
            <p>찜해두신 <strong>${row.PRODUCT_NAME}</strong> 상품이 지금 할인 중입니다.</p>
            <p>할인 혜택: <strong style="color:red;">${discountText} 할인</strong></p>
            <p>지금 바로 확인해보세요!</p>
          `;
        sendEmail(row.EMAIL, subject, content);
      }
    }
  } catch (err) {
    console.error("할인 알림 전송 중 오류:", err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
}

/**
 * 2. 재입고 알림
 */
async function sendRestockAlert(productCode) {
  let connection;
  try {
    connection = await db.getConnection();

    const sql = `
      SELECT M.EMAIL, M.USER_NAME, P.PRODUCT_NAME
      FROM EaGCart_Wishlists W
      JOIN EaGCart_Members M ON W.USER_CODE = M.USER_CODE
      JOIN EaGCart_Products P ON W.PRODUCT_CODE = P.PRODUCT_CODE
      WHERE P.PRODUCT_CODE = :code
        AND P.STATUS = '판매중'
        AND P.CURRENT_STOCK > 0
    `;

    const result = await connection.execute(
      sql,
      { code: productCode },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) return;

    console.log(
      `[재입고 알림] 상품(${productCode}) 대상 유저 ${result.rows.length}명에게 발송.`
    );

    for (const row of result.rows) {
      if (!row.EMAIL) continue;
      const subject = `[EaGCart] 기다리시던 '${row.PRODUCT_NAME}' 상품이 재입고되었습니다!`;
      const content = `
        <h3>안녕하세요, ${row.USER_NAME}님!</h3>
        <p>품절되었던 <strong>${row.PRODUCT_NAME}</strong> 상품이 다시 판매를 시작했습니다.</p>
        <p>재고가 소진되기 전에 확인해보세요!</p>
      `;
      sendEmail(row.EMAIL, subject, content);
    }
  } catch (err) {
    console.error("재입고 알림 전송 중 오류:", err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
}

/**
 * 3. 재고 부족 알림
 */
async function checkLowStock(productCodes) {
  const codes = Array.isArray(productCodes) ? productCodes : [productCodes];
  if (codes.length === 0) return;

  let connection;
  try {
    connection = await db.getConnection();

    const bindVars = {};
    const bindKeys = codes
      .map((code, idx) => {
        const key = `p${idx}`;
        bindVars[key] = code;
        return `:${key}`;
      })
      .join(",");

    const sql = `
      SELECT PRODUCT_CODE, PRODUCT_NAME, CURRENT_STOCK, OPTIMAL_STOCK
      FROM EaGCart_Products
      WHERE PRODUCT_CODE IN (${bindKeys})
        AND CURRENT_STOCK < FLOOR(OPTIMAL_STOCK * 0.6)
    `;

    const result = await connection.execute(sql, bindVars, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    if (result.rows.length > 0) {
      const adminEmail = process.env.GMAIL_USER;
      const subject = `[재고 경고] ${result.rows.length}개 상품 재고 부족 알림`;

      let tableRows = result.rows
        .map(
          (item) =>
            `<tr>
          <td>${item.PRODUCT_NAME}</td>
          <td>${item.PRODUCT_CODE}</td>
          <td style="color:red; font-weight:bold;">${item.CURRENT_STOCK}</td>
          <td>${Math.floor(item.OPTIMAL_STOCK * 0.6)} (적정:${
              item.OPTIMAL_STOCK
            })</td>
         </tr>`
        )
        .join("");

      const content = `
        <h3>재고 부족 알림</h3>
        <p>사용자 주문으로 인해 다음 상품들의 재고가 안전재고 미만으로 떨어졌습니다.</p>
        <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f3f4f6;">
                <th>상품명</th><th>코드</th><th>현재고</th><th>안전재고</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      `;

      console.log(
        `[재고 알림] 관리자에게 ${result.rows.length}건의 재고 부족 알림 전송.`
      );
      await sendEmail(adminEmail, subject, content);
    }
  } catch (err) {
    console.error("재고 체크 중 오류:", err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {}
    }
  }
}

/**
 * 4. [신규] 클레임 거절 알림 (사용자에게 발송)
 */
async function sendClaimRejectEmail(email, userName, productName, reason) {
  if (!email) return;
  const subject = `[EaGCart] 반품/교환 요청 처리 안내`;
  const content = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h3 style="color: #4b5563;">안녕하세요, ${userName}님.</h3>
      <p>요청하신 <strong>${productName}</strong> 상품의 반품/교환 요청이 처리되었습니다.</p>
      
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0; color: #ef4444; font-weight: bold;">처리 결과: 거절</p>
        <p style="margin: 10px 0 0 0;"><strong>사유:</strong> ${
          reason || "사유 없음"
        }</p>
      </div>

      <p style="font-size: 12px; color: #9ca3af;">문의사항이 있으시면 고객센터로 연락 바랍니다.</p>
    </div>
  `;
  await sendEmail(email, subject, content);
}

module.exports = {
  schedule,
  sendDiscountAlert,
  sendRestockAlert,
  checkLowStock,
  sendClaimRejectEmail, // [신규]
};
