const db = require("../config/db");
const oracledb = require("oracledb");

// 1. 문의 목록 조회 (관리자용 - 전체 조회 및 필터)
async function getInquiryList() {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        I.INQUIRY_CODE,
        I.TITLE,
        U.USER_ID,
        U.USER_NAME,
        TO_CHAR(I.REGISTRATION_DATE, 'YYYY-MM-DD') AS REG_DATE,
        I.STATUS,
        I.CONTENT, -- 검색용
        I.ANSWER_CONTENT -- 검색용
      FROM EaGCart_Inquiries I
      JOIN EaGCart_Members U ON I.USER_CODE = U.USER_CODE
      ORDER BY 
        CASE WHEN I.STATUS = '대기중' THEN 1 ELSE 2 END ASC, -- 대기중인 것 우선
        I.REGISTRATION_DATE DESC
    `;

    const result = await connection.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: {
        CONTENT: { type: oracledb.STRING },
        ANSWER_CONTENT: { type: oracledb.STRING },
      },
    });

    return result.rows.map((row) => ({
      code: row.INQUIRY_CODE,
      title: row.TITLE,
      userId: row.USER_ID,
      userName: row.USER_NAME,
      regDate: row.REG_DATE,
      status: row.STATUS,
      content: row.CONTENT, // 프론트엔드 검색 필터링용
      answer: row.ANSWER_CONTENT,
    }));
  } finally {
    if (connection) await connection.close();
  }
}

// 2. 문의 상세 조회 (모달용)
async function getInquiryDetail(code) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      SELECT 
        I.INQUIRY_CODE,
        I.TITLE,
        I.CONTENT,
        TO_CHAR(I.REGISTRATION_DATE, 'YYYY-MM-DD HH24:MI') AS REG_DATE,
        I.STATUS,
        I.ANSWER_CONTENT,
        TO_CHAR(I.ANSWER_DATE, 'YYYY-MM-DD HH24:MI') AS ANSWER_DATE,
        U.USER_ID,
        U.USER_NAME
      FROM EaGCart_Inquiries I
      JOIN EaGCart_Members U ON I.USER_CODE = U.USER_CODE
      WHERE I.INQUIRY_CODE = :code
    `;

    const result = await connection.execute(
      sql,
      { code },
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: {
          CONTENT: { type: oracledb.STRING },
          ANSWER_CONTENT: { type: oracledb.STRING },
        },
      }
    );

    return result.rows[0];
  } finally {
    if (connection) await connection.close();
  }
}

// 3. 답변 등록 (업데이트)
async function updateAnswer(code, content) {
  let connection;
  try {
    connection = await db.getConnection();
    const sql = `
      UPDATE EaGCart_Inquiries
      SET ANSWER_CONTENT = :content,
          ANSWER_DATE = SYSDATE,
          STATUS = '답변완료'
      WHERE INQUIRY_CODE = :code
    `;

    await connection.execute(sql, { content, code }, { autoCommit: true });
    return true;
  } finally {
    if (connection) await connection.close();
  }
}

module.exports = {
  getInquiryList,
  getInquiryDetail,
  updateAnswer,
};
