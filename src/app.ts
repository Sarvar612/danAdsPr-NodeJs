import express from "express";
import { notesRouter, errorHandler } from "./notes";

export const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.use("/notes", notesRouter);


app.use(errorHandler);
