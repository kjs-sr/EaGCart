const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 문의 등록
async function createInquiry(userCode, title, content) {
  let connection;
  try {
    connection = await db.getConnection();

    // 문의 코드 생성 (INQ + 타임스탬프)
    const inquiryCode = "INQ" + Date.now();

    const sql = `
      INSERT INTO EaGCart_Inquiries (
        INQUIRY_CODE, USER_CODE, TITLE, CONTENT, REGISTRATION_DATE, STATUS
      ) VALUES (
        :code, :userCode, :title, :content, SYSDATE, '대기중'
      )
    `;

    await connection.execute(
      sql,
      {
        code: inquiryCode,
        userCode: userCode,
        title: title,
        content: content,
      },
      { autoCommit: true }
    );
    return true;
  } catch (err) {
    console.error("Create Inquiry Error:", err);
    throw err;
  } finally {
    if (connection) await connection.close();
  }
}

// 2. 나의 문의 내역 조회
async function getMyInquiries(userCode) {
  let connection;
  try {
    connection = await db.getConnection();

    const sql = `
      SELECT 
        INQUIRY_CODE, 
        TITLE, 
        CONTENT, 
        TO_CHAR(REGISTRATION_DATE, 'YYYY.MM.DD') AS REG_DATE,
        TO_CHAR(ANSWER_DATE, 'YYYY.MM.DD') AS ANS_DATE,
        STATUS,
        ANSWER_CONTENT
      FROM EaGCart_Inquiries
      WHERE USER_CODE = :userCode
      ORDER BY REGISTRATION_DATE DESC
    `;

    const result = await connection.execute(
      sql,
      { userCode },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        // [중요 수정] CLOB 데이터를 문자열(String)로 가져오도록 명시
        fetchInfo: {
          CONTENT: { type: oracledb.STRING },
          ANSWER_CONTENT: { type: oracledb.STRING },
        },
      }
    );

    return result.rows.map((row) => ({
      code: row.INQUIRY_CODE,
      title: row.TITLE,
      content: row.CONTENT, // 이제 [object Object]가 아닌 텍스트로 나옵니다.
      createdAt: row.REG_DATE,
      answeredAt: row.ANS_DATE || "-",
      status: row.STATUS,
      answer: row.ANSWER_CONTENT, // 답변 내용도 텍스트로 정상 출력됩니다.
    }));
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  createInquiry,
  getMyInquiries,
};
