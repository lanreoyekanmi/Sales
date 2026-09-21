import "./config/env.js";
import connectDB from "./config/database.js";
import app from "./app.js";
import { telegramNotifier } from "./services/telegram.service.js";

const startServer = async () => {
  try {
    // process.exit belongs only here (the local dev/standalone-server bootstrap) — the Vercel
    // Function entrypoint (api/[...path].js) calls the same connectDB() but must never exit
    // the process on a connection failure, since that could tear down a container serving
    // other concurrent invocations; it returns a 502 for that one request instead.
    await connectDB();

    app.on("error", (err) => {
      console.error("Error starting the server:", err);
      throw err;
    });

    if (!telegramNotifier.isConfigured()) {
      console.log(
        "[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not configured — Telegram notifications are disabled."
      );
    }

    app.listen(process.env.PORT || 8000, () => {
      console.log(`Server is running on port ${process.env.PORT}`);
    });

  } catch (error) {
    console.log("Error starting the server:", error);
    process.exit(1);
  }
};
    startServer();