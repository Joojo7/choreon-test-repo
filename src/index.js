const express = require("express");
const checkRouter = require("./check");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/check", checkRouter);

app.listen(PORT, () => {
  console.log(`Datastore checker listening on port ${PORT}`);
});
