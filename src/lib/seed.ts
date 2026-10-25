import { ObjectId, type Db } from "mongodb";
import { requestsCollection, usersCollection, type RequestDoc, type UserDoc } from "./collections";
import type { CloseReason, HistoryEvent, Status, TriageField, TriageValues, Urgency } from "./domain";

export const SEED_USERS: UserDoc[] = [
  { _id: "priya", name: "Priya", role: "ops_lead" },
  { _id: "marcus", name: "Marcus", role: "ops" },
  { _id: "dana", name: "Dana", role: "ops" },
  { _id: "luis", name: "Luis", role: "ops" },
  { _id: "hannah", name: "Hannah", role: "ops" },
  { _id: "theo", name: "Theo", role: "ops" },
  { _id: "sam", name: "Sam", role: "requester" },
  { _id: "alex", name: "Alex", role: "requester" },
  { _id: "jordan", name: "Jordan", role: "requester" },
  { _id: "morgan", name: "Morgan", role: "requester" },
];

/** Inserts demo users and sample requests, but only into a completely empty database. */
export async function seedIfEmpty(db: Db): Promise<void> {
  const users = usersCollection(db);
  const requests = requestsCollection(db);
  const [userCount, requestCount] = await Promise.all([
    users.countDocuments({}, { limit: 1 }),
    requests.countDocuments({}, { limit: 1 }),
  ]);
  if (userCount > 0 || requestCount > 0) return;

  const sampleRequests = buildSeedRequests(new Date());
  await users.insertMany(SEED_USERS);
  await requests.insertMany(sampleRequests);
  console.log(`[db] Seeded ${SEED_USERS.length} users and ${sampleRequests.length} sample requests`);
}

const HOUR = 60 * 60 * 1000;

// Seeded triage results are canned, not real model output, and say so.
const SEED_MODEL = "seed-data";

function buildSeedRequests(now: Date): RequestDoc[] {
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

  return [
    seedRequest({
      title: "Laptop for new designer starting Monday",
      description:
        "A product designer starts Monday and needs a MacBook Pro (32GB RAM or more), a monitor, and a keyboard. Can it arrive at the office by Friday?",
      requesterId: "sam",
      requesterUrgency: "high",
      createdAt: ago(3),
      triage: {
        category: "laptops_hardware",
        urgency: "high",
        summary: "New designer starting Monday needs a MacBook Pro, monitor and keyboard by Friday.",
      },
    }),
    seedRequest({
      title: "Printer on 2nd floor keeps jamming",
      description: "The printer by the 2nd floor kitchen jams on every double-sided job.",
      requesterId: "morgan",
      requesterUrgency: "medium",
      createdAt: ago(1),
      triage: { error: "Seeded example of a failed triage: model output didn't match the schema." },
    }),
    seedRequest({
      title: "Salesforce access for new account executive",
      description: "Our new account executive started today and needs a Salesforce login with the standard AE permissions.",
      requesterId: "alex",
      requesterUrgency: "medium",
      createdAt: ago(26),
      triage: {
        category: "system_access",
        urgency: "medium",
        summary: "New account executive needs a Salesforce login with standard AE permissions.",
      },
      accepted: {
        category: "system_access",
        urgency: "medium",
        summary: "New account executive needs a Salesforce login with standard AE permissions.",
      },
      events: [acceptTriage(ago(20), "priya"), assign(ago(20), "priya", "marcus")],
    }),
    seedRequest({
      title: "Renew Zoom contract before it lapses Nov 15",
      description:
        "Our Zoom Business plan auto-renews on Nov 15 at a 20% higher rate. Finance wants to renegotiate or move to annual billing before then.",
      requesterId: "jordan",
      requesterUrgency: "high",
      createdAt: ago(120),
      triage: {
        category: "vendor_contracts",
        urgency: "high",
        summary: "Zoom renews Nov 15 at a higher rate; renegotiate or switch to annual billing first.",
      },
      accepted: {
        category: "vendor_contracts",
        urgency: "high",
        summary: "Zoom renews Nov 15 at a higher rate; renegotiate or switch to annual billing first.",
      },
      events: [
        acceptTriage(ago(119), "priya"),
        assign(ago(118), "priya", "marcus"),
        assign(ago(110), "priya", "dana", "marcus"),
        move(ago(100), "dana", "new", "in_progress"),
      ],
    }),
    seedRequest({
      title: "Badge access for weekend AV contractors",
      description:
        "A contractor crew is installing the new AV system in the boardroom this Saturday and Sunday and needs building badges for both days.",
      requesterId: "alex",
      requesterUrgency: "high",
      createdAt: ago(30),
      triage: {
        category: "office_facilities",
        urgency: "high",
        summary: "Weekend AV contractor crew needs building badges for Saturday and Sunday.",
      },
      accepted: {
        category: "system_access",
        urgency: "high",
        summary: "Weekend AV contractor crew needs building badges for Saturday and Sunday.",
      },
      events: [
        assign(ago(29), "priya", "priya"),
        overrideTriage(ago(29), "priya", ["category"]),
        move(ago(28), "priya", "new", "in_progress"),
      ],
    }),
    seedRequest({
      title: "Move the analytics team to the 3rd floor",
      description:
        "The six-person analytics team is moving from the 2nd floor to the 3rd. We need desks, monitors, and network drops set up. The date is flexible.",
      requesterId: "morgan",
      requesterUrgency: "medium",
      createdAt: ago(72),
      triage: {
        category: "office_facilities",
        urgency: "medium",
        summary: "Move the six-person analytics team to the 3rd floor, including desks and network.",
      },
      accepted: {
        category: "office_facilities",
        urgency: "low",
        summary: "Move the six-person analytics team to the 3rd floor, including desks and network.",
      },
      events: [
        assign(ago(70), "priya", "luis"),
        overrideTriage(ago(69), "luis", ["urgency"]),
        move(ago(60), "luis", "new", "in_progress"),
        move(ago(40), "luis", "in_progress", "waiting_on_requester"),
      ],
    }),
    seedRequest({
      title: "Replace flickering monitor",
      description: "My external monitor flickers every few minutes. It's the Dell at desk 2-14.",
      requesterId: "sam",
      requesterUrgency: "low",
      createdAt: ago(240),
      triage: {
        category: "laptops_hardware",
        urgency: "low",
        summary: "External monitor at desk 2-14 flickers and needs replacing.",
      },
      accepted: {
        category: "laptops_hardware",
        urgency: "low",
        summary: "External monitor at desk 2-14 flickers and needs replacing.",
      },
      events: [
        assign(ago(236), "priya", "hannah"),
        acceptTriage(ago(236), "hannah"),
        move(ago(230), "hannah", "new", "in_progress"),
        move(ago(200), "hannah", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "Expense tool access for a contractor",
      description: "Can our design contractor get access to the expense tool so they can submit invoices?",
      requesterId: "jordan",
      requesterUrgency: "low",
      createdAt: ago(150),
      triage: {
        category: "system_access",
        urgency: "low",
        summary: "Design contractor needs expense tool access to submit invoices.",
      },
      events: [assign(ago(148), "priya", "theo"), move(ago(140), "theo", "new", "closed", "cancelled_by_requester")],
    }),
  ];
}

interface SeedInput {
  title: string;
  description: string;
  requesterId: string;
  requesterUrgency: Urgency;
  createdAt: Date;
  /** Canned triage outcome: a suggestion, or the reason it failed. */
  triage: TriageValues | { error: string };
  accepted?: TriageValues;
  /** What happened after creation and triage, oldest first. */
  events?: HistoryEvent[];
}

/** Builds a request whose status and assignee are derived from its history, so the two always agree. */
function seedRequest(input: SeedInput): RequestDoc {
  const { triage, createdAt, requesterId } = input;
  const triagedAt = new Date(createdAt.getTime() + 5_000);
  const failed = "error" in triage;

  const history: HistoryEvent[] = [
    { type: "created", at: createdAt, actorId: requesterId },
    failed
      ? { type: "triage_failed", at: triagedAt, actorId: requesterId, detail: { error: triage.error } }
      : { type: "triage_completed", at: triagedAt, actorId: requesterId, detail: { model: SEED_MODEL } },
    ...(input.events ?? []),
  ];
  const lastStatusChange = history.findLast((e) => e.type === "status_changed");
  const lastAssignment = history.findLast((e) => e.type === "assigned");

  return {
    _id: new ObjectId(),
    title: input.title,
    description: input.description,
    requesterId,
    requesterUrgency: input.requesterUrgency,
    status: lastStatusChange?.toStatus ?? "new",
    closeReason: lastStatusChange?.detail?.closeReason ?? null,
    assigneeId: lastAssignment?.toAssigneeId ?? null,
    triage: failed
      ? { status: "failed", suggestion: null, model: SEED_MODEL, error: triage.error, attemptedAt: triagedAt }
      : { status: "complete", suggestion: triage, model: SEED_MODEL, error: null, attemptedAt: triagedAt },
    accepted: input.accepted ?? null,
    history,
    createdAt,
    updatedAt: history[history.length - 1].at,
  };
}

function assign(at: Date, actorId: string, toAssigneeId: string, fromAssigneeId: string | null = null): HistoryEvent {
  return { type: "assigned", at, actorId, fromAssigneeId, toAssigneeId };
}

function move(at: Date, actorId: string, fromStatus: Status, toStatus: Status, closeReason?: CloseReason): HistoryEvent {
  return { type: "status_changed", at, actorId, fromStatus, toStatus, ...(closeReason ? { detail: { closeReason } } : {}) };
}

function acceptTriage(at: Date, actorId: string): HistoryEvent {
  return { type: "triage_accepted", at, actorId };
}

function overrideTriage(at: Date, actorId: string, overriddenFields: TriageField[]): HistoryEvent {
  return { type: "triage_overridden", at, actorId, detail: { overriddenFields } };
}
