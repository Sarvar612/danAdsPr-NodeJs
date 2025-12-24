import { Router } from "express";
import { z } from "zod";


type Note = {
    id: string;
    title: string;
    content: string;
    createdAt: string; 
    updatedAt: string; 
};

//In Memmory Storage//
const notes = new Map<string, Note>();


function makeId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class HttpError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
        public details?: unknown
    ) {
        super(message);
    }
}


const createSchema = z.object({
    title: z.string().trim().min(1, "title is required").max(200, "title too long"),
    content: z
        .string()
        .trim()
        .min(1, "content is required")
        .max(10_000, "content too long"),
});

const updateSchema = z
    .object({
        title: z.string().trim().min(1).max(200).optional(),
        content: z.string().trim().min(1).max(10_000).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, {
        message: "At least one of title/content must be provided",
    });

const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    q: z.string().trim().min(1).optional(),
});


export const notesRouter = Router();

//Get method included with pagination feautere//
notesRouter.get("/", (req, res, next) => {
    try {
        const { page, limit, q } = listQuerySchema.parse(req.query);

        let items = Array.from(notes.values());

        
        items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        if (q) {
            const keyword = q.toLowerCase();
            items = items.filter(
                (n) =>
                    n.title.toLowerCase().includes(keyword) ||
                    n.content.toLowerCase().includes(keyword)
            );
        }

        const total = items.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const safePage = Math.min(page, totalPages);

        const start = (safePage - 1) * limit;
        const pageItems = items.slice(start, start + limit);

        res.status(200).json({
            items: pageItems,
            meta: { page: safePage, limit, total, totalPages },
        });
    } catch (e) {
        next(e);
    }
});

/**
 * GET /notes/:id
 */
notesRouter.get("/:id", (req, res, next) => {
    try {
        const note = notes.get(req.params.id);
        if (!note) throw new HttpError(404, "NOTE_NOT_FOUND", "Note not found");
        res.status(200).json(note);
    } catch (e) {
        next(e);
    }
});

/**
 * POST /notes
 * body: { title, content }
 */
notesRouter.post("/", (req, res, next) => {
    try {
        const body = createSchema.parse(req.body);

        const now = new Date().toISOString();
        const note: Note = {
            id: makeId(),
            title: body.title,
            content: body.content,
            createdAt: now,
            updatedAt: now,
        };

        notes.set(note.id, note);
        res.status(201).json(note);
    } catch (e) {
        next(e);
    }
});

notesRouter.put("/:id", (req, res, next) => {
    try {
        const id = req.params.id;
        const existing = notes.get(id);

        if (!existing) {
            throw new HttpError(404, "NOTE_NOT_FOUND", "Note not found");
        }

        // PUT = FULL update
        const body = createSchema.parse(req.body);

        const updated: Note = {
            ...existing,
            title: body.title,
            content: body.content,
            updatedAt: new Date().toISOString(),
        };

        notes.set(id, updated);
        res.status(200).json(updated);
    } catch (e) {
        next(e);
    }
});


/**
 * PATCH /notes/:id
 * body: { title?, content? }
 */
notesRouter.patch("/:id", (req, res, next) => {
    try {
        const id = req.params.id;
        const existing = notes.get(id);
        if (!existing) throw new HttpError(404, "NOTE_NOT_FOUND", "Note not found");

        const patch = updateSchema.parse(req.body);
        const now = new Date().toISOString();

        const updated: Note = {
            ...existing,
            ...patch,
            updatedAt: now,
        };

        notes.set(id, updated);
        res.status(200).json(updated);
    } catch (e) {
        next(e);
    }
});

/**
 * DELETE /notes/:id
 */
notesRouter.delete("/:id", (req, res, next) => {
    try {
        const id = req.params.id;
        const existing = notes.get(id);
        if (!existing) throw new HttpError(404, "NOTE_NOT_FOUND", "Note not found");

        notes.delete(id);
        res.status(200).json({ deleted: true });
    } catch (e) {
        next(e);
    }
});

/** ===== Error middleware for this module ===== */
export function errorHandler(err: unknown, _req: any, res: any, _next: any) {
    // Zod errors → 400
    if (err instanceof z.ZodError) {
        return res.status(400).json({
            error: {
                code: "VALIDATION_ERROR",
                message: "Invalid request data",
                details: err.issues,
            },
        });
    }

    // Our errors
    if (err instanceof HttpError) {
        return res.status(err.status).json({
            error: {
                code: err.code,
                message: err.message,
                details: err.details ?? null,
            },
        });
    }

    console.error(err);
    return res.status(500).json({
        error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong" },
    });
}
