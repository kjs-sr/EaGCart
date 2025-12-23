require("dotenv").config();
const express = require("express");
const app = express();
const port = 3000;

const oracledb = require("oracledb");
const db = require("./config/db");
const path = require("path");
const session = require("express-session");
const commonMiddleware = require("./middleware/common");

// 1. 미들웨어 설정
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 24시간
    },
  })
);

app.use(commonMiddleware.loadCommonData);

// 2. 정적 파일 경로 설정
app.use(express.static(path.join(__dirname, "public")));

// 3. EJS 템플릿 엔진 설정
app.set("view engine", "ejs");
app.set("views", "./views");

// 4. Oracle Client 설정
try {
  oracledb.initOracleClient({ libDir: "C:/oracle/instantclient_23_0" });
  console.log("Oracle Client initialized for Thick mode.");
} catch (err) {
  console.error("Failed to initialize Oracle Client (Thick mode):", err);
}

// 5. 유저 정보 미들웨어
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// 6. 라우터 등록
// [중요] cart.js를 먼저 등록해도, 내부 경로가 /cart로 변경되었으므로 메인 페이지(/)를 간섭하지 않습니다.
app.use("/admin", require("./routes/admin"));
app.use("/", require("./routes/auth"));
app.use("/", require("./routes/cart")); // 장바구니
app.use("/", require("./routes/mypage"));
app.use("/", require("./routes/qna"));
app.use("/", require("./routes/index")); // 메인 (가장 마지막에 두는 것이 관례상 좋습니다)

// 7. 서버 시작
db.initialize()
  .then(() => {
    app.listen(port, () => {
      console.log(`쇼핑몰 서버가 http://localhost:${port} 에서 실행 중입니다.`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server due to DB error:", err);
    process.exit(1);
  });

process.on("SIGTERM", () => {
  db.close().then(() => process.exit(0));
});
