import { z } from "zod";

export const genealogyDateSchema = z.object({
  calendar: z.enum(["gregorian", "vietnamese_lunar", "julian", "unknown"]),
  precision: z.enum(["exact", "month", "month_day", "year", "about", "before", "after", "range", "text", "unknown"]),
  year: z.number().int().min(-5000).max(5000).optional(),
  month: z.number().int().min(1).max(13).optional(),
  day: z.number().int().min(1).max(31).optional(),
  isLeapMonth: z.boolean().optional(),
  originalText: z.string().min(1),
  rangeEnd: z.object({ year: z.number().int(), month: z.number().int().min(1).max(13).optional(), day: z.number().int().min(1).max(31).optional() }).optional(),
  timezone: z.literal("Asia/Ho_Chi_Minh").optional()
}).superRefine((value, context) => {
  if (value.precision === "year" && (value.month !== undefined || value.day !== undefined)) {
    context.addIssue({ code: "custom", path: ["precision"], message: "Year precision cannot include month or day" });
  }
  if (value.precision === "month_day" && (value.month === undefined || value.day === undefined || value.year !== undefined)) {
    context.addIssue({ code: "custom", path: ["precision"], message: "Month-day precision requires month/day and omits year" });
  }
  if (value.calendar !== "vietnamese_lunar" && value.isLeapMonth === true) {
    context.addIssue({ code: "custom", path: ["isLeapMonth"], message: "Leap month only applies to Vietnamese lunar dates" });
  }
});
