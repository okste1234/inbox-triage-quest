import { describe, expect, it } from "vitest";
import { checkDraft } from "../src/guardrails.js";

describe("checkDraft", () => {
  it("passes a short, safe reply", () => {
    expect(checkDraft("Thanks for checking in. I'll pass your note on to the hiring team.")).toEqual({ flags: [], blocked: false });
  });

  it("blocks money amounts", () => {
    for (const t of ["The salary is $90,000.", "We can offer 85k", "Around £50000 a year", "Pay of 400000 naira", "salary of 70 thousand"]) {
      const r = checkDraft(t);
      expect(r.flags, t).toContain("money");
      expect(r.blocked, t).toBe(true);
    }
  });

  it("blocks promises about the outcome", () => {
    for (const t of ["You got the job!", "You're hired.", "We will offer you the role.", "I guarantee you an interview."]) {
      const r = checkDraft(t);
      expect(r.flags, t).toContain("hiring_promise");
      expect(r.blocked, t).toBe(true);
    }
  });

  it("flags but does not block specific dates and times", () => {
    for (const t of ["See you Thursday.", "We can meet at 3pm.", "Expect news on 12 March.", "I'll reply tomorrow."]) {
      const r = checkDraft(t);
      expect(r.flags, t).toContain("date_time");
      expect(r.blocked, t).toBe(false);
    }
  });

  it("flags drafts over 90 words", () => {
    const long = Array.from({ length: 91 }, () => "word").join(" ");
    expect(checkDraft(long).flags).toContain("too_long");
    expect(checkDraft(Array.from({ length: 90 }, () => "word").join(" ")).flags).not.toContain("too_long");
  });

  it("flags contact details echoed into a draft", () => {
    expect(checkDraft("Write to jo@example.com").flags).toContain("contact_details");
    expect(checkDraft("Call +234 801 234 5678").flags).toContain("contact_details");
  });

  it("does not flag congratulating someone on their new role in a withdrawal reply", () => {
    expect(checkDraft("Congratulations on your new role. We wish you well.").flags).toEqual([]);
  });

  it("flags, but does not block, drafts that claim an action already happened", () => {
    for (const t of [
      "We have withdrawn your application.",
      "I've forwarded your question to the hiring team.",
      "I\u2019ve forwarded your question to the hiring team.",
      "We\u2019ve rescheduled your interview.",
      "Your application has been withdrawn.",
      "Your interview has been cancelled.",
      "I have passed your note to the recruiter.",
      "We have already updated your details.",
    ]) {
      const r = checkDraft(t);
      expect(r.flags, t).toContain("claims_action");
      expect(r.blocked, t).toBe(false);
    }
  });

  it("does not flag forward-looking wording or harmless statements", () => {
    for (const t of [
      "I'll pass your question to the hiring team.",
      "The team will review your application and follow up.",
      "Thanks for letting us know.",
      "We have received your message.",
      "I'm sorry to hear that.",
      "Please let us know if anything changes.",
    ])
      expect(checkDraft(t).flags, t).not.toContain("claims_action");
  });
});
