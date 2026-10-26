import { ObjectId, type Db } from "mongodb";
import { requestsCollection, usersCollection, type RequestDoc, type UserDoc } from "./collections";
import {
  triageReviewEvent,
  type CloseReason,
  type HistoryEvent,
  type Status,
  type TriageValues,
  type Urgency,
} from "./domain";

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

// All times are hours before seeding runs, so the data is always recent.
export function buildSeedRequests(now: Date): RequestDoc[] {
  const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);

  return [
    // Open requests, in each stage of the workflow.
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
      reviewed: { at: ago(20), by: "priya" },
      events: [assign(ago(20), "priya", "marcus")],
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
      reviewed: { at: ago(119), by: "priya" },
      events: [
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
      reviewed: { at: ago(29), by: "priya", change: { category: "system_access" } },
      events: [assign(ago(29), "priya", "priya"), move(ago(28), "priya", "new", "in_progress")],
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
      reviewed: { at: ago(69), by: "luis", change: { urgency: "low" } },
      events: [
        assign(ago(70), "priya", "luis"),
        move(ago(60), "luis", "new", "in_progress"),
        move(ago(40), "luis", "in_progress", "waiting_on_requester"),
      ],
    }),

    // Finished requests from the past three weeks, so /metrics has data.
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
      reviewed: { at: ago(236), by: "hannah" },
      events: [
        assign(ago(236), "priya", "hannah"),
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
      events: [
        assign(ago(148), "priya", "theo"),
        move(ago(140), "jordan", "new", "closed", "cancelled_by_requester"), // the requester cancelled it
      ],
    }),
    seedRequest({
      title: "Laptop battery is swelling",
      description: "The trackpad on my laptop is bulging up and the case no longer closes flat. I think the battery is swelling.",
      requesterId: "sam",
      requesterUrgency: "high",
      createdAt: ago(500),
      triage: {
        category: "laptops_hardware",
        urgency: "high",
        summary: "Laptop battery is swelling and the laptop needs replacing.",
      },
      reviewed: { at: ago(499), by: "priya" },
      events: [
        assign(ago(499), "priya", "hannah"),
        move(ago(497), "hannah", "new", "in_progress"),
        move(ago(473), "hannah", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "Renew Figma licenses for the design team",
      description: "Our Figma seats renew at the end of the month. We may need two more seats; I'll confirm the headcount.",
      requesterId: "jordan",
      requesterUrgency: "medium",
      createdAt: ago(470),
      triage: {
        category: "vendor_contracts",
        urgency: "medium",
        summary: "Renew the design team's Figma licenses, possibly with two extra seats.",
      },
      reviewed: { at: ago(466), by: "priya" },
      events: [
        assign(ago(466), "priya", "dana"),
        move(ago(450), "dana", "new", "in_progress"),
        move(ago(440), "dana", "in_progress", "waiting_on_requester"), // needs the seat count
        move(ago(420), "dana", "waiting_on_requester", "in_progress"),
        move(ago(414), "dana", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "GitHub access for a new contractor",
      description: "A contractor joins the platform team tomorrow and needs read and write access to the infra repositories.",
      requesterId: "alex",
      requesterUrgency: "high",
      createdAt: ago(430),
      triage: {
        category: "system_access",
        urgency: "high",
        summary: "New platform contractor needs write access to the infra GitHub repositories by tomorrow.",
      },
      reviewed: { at: ago(427), by: "theo", change: { urgency: "medium" } },
      events: [
        assign(ago(429.5), "priya", "marcus"),
        assign(ago(428), "priya", "theo", "marcus"), // Marcus was out sick
        move(ago(427), "theo", "new", "in_progress"),
        move(ago(425), "theo", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "Book a room for the quarterly offsite",
      description: "We need a room for 25 people with a projector for the quarterly offsite next month.",
      requesterId: "morgan",
      requesterUrgency: "low",
      createdAt: ago(400),
      triage: {
        category: "other",
        urgency: "low",
        summary: "Book a 25-person room with a projector for next month's quarterly offsite.",
      },
      reviewed: { at: ago(394), by: "luis", change: { category: "office_facilities" } },
      events: [
        assign(ago(394), "priya", "luis"),
        move(ago(370), "luis", "new", "in_progress"),
        move(ago(346), "luis", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "Replace broken desk chair",
      description: "The gas lift on my chair is broken and it sinks to the floor within a few minutes.",
      requesterId: "sam",
      requesterUrgency: "medium",
      createdAt: ago(360),
      triage: {
        category: "office_facilities",
        urgency: "medium",
        summary: "Desk chair's gas lift is broken and the chair needs replacing.",
      },
      reviewed: { at: ago(358), by: "priya" },
      events: [
        assign(ago(358), "priya", "luis"),
        move(ago(355), "luis", "new", "in_progress"),
        move(ago(352), "luis", "in_progress", "waiting_on_requester"), // which desk?
        move(ago(334), "luis", "waiting_on_requester", "in_progress"),
        move(ago(330), "luis", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "Cancel unused Zoom webinar add-on",
      description: "We pay for the Zoom webinar add-on but haven't run a webinar in a year. Please cancel it.",
      requesterId: "jordan",
      requesterUrgency: "low",
      createdAt: ago(330),
      triage: {
        category: "vendor_contracts",
        urgency: "low",
        summary: "Cancel the unused Zoom webinar add-on.",
      },
      reviewed: { at: ago(327), by: "dana" },
      events: [
        assign(ago(327), "priya", "dana"),
        move(ago(306), "dana", "new", "in_progress"),
        move(ago(304), "dana", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "VPN access for a remote work week",
      description: "I'm working from my parents' place next week and need VPN access set up before Monday.",
      requesterId: "morgan",
      requesterUrgency: "medium",
      createdAt: ago(300),
      triage: {
        category: "system_access",
        urgency: "medium",
        summary: "Needs VPN access for a remote work week.",
      },
      reviewed: {
        at: ago(298.5),
        by: "marcus",
        change: { urgency: "high", summary: "Set up VPN access before Monday for a week of remote work." },
      },
      events: [
        assign(ago(299), "priya", "marcus"),
        move(ago(298.5), "marcus", "new", "in_progress"),
        move(ago(296), "marcus", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "Second monitor for my home office",
      description: "Could the company send me a second monitor for working from home?",
      requesterId: "alex",
      requesterUrgency: "low",
      createdAt: ago(260),
      triage: {
        category: "laptops_hardware",
        urgency: "low",
        summary: "Wants a second monitor shipped to their home office.",
      },
      reviewed: { at: ago(255), by: "hannah" },
      events: [
        assign(ago(255), "priya", "hannah"),
        move(ago(240), "hannah", "new", "in_progress"),
        move(ago(238), "hannah", "in_progress", "closed", "wont_do"), // home equipment isn't covered
      ],
    }),
    seedRequest({
      title: "Admin rights on my laptop",
      description: "I need local admin rights to install a database tool for a data project.",
      requesterId: "sam",
      requesterUrgency: "medium",
      createdAt: ago(200),
      triage: {
        category: "system_access",
        urgency: "medium",
        summary: "Wants local admin rights on their laptop to install a database tool.",
      },
      reviewed: { at: ago(198), by: "priya" },
      events: [
        assign(ago(198), "priya", "marcus"),
        move(ago(196), "marcus", "new", "in_progress"),
        move(ago(194), "marcus", "in_progress", "closed", "cant_do"), // security policy
      ],
    }),
    seedRequest({
      title: "Order T-shirts for the hackathon",
      description: "We'd like branded T-shirts for the 40 people at next month's hackathon. I'll send sizes.",
      requesterId: "morgan",
      requesterUrgency: "low",
      createdAt: ago(150),
      triage: {
        category: "other",
        urgency: "low",
        summary: "Order 40 branded T-shirts for next month's hackathon; sizes to follow.",
      },
      reviewed: { at: ago(142), by: "theo" },
      events: [
        assign(ago(142), "priya", "theo"),
        move(ago(120), "theo", "new", "in_progress"),
        move(ago(116), "theo", "in_progress", "waiting_on_requester"), // waiting for sizes
        move(ago(90), "theo", "waiting_on_requester", "in_progress"),
        move(ago(70), "theo", "in_progress", "done"),
      ],
    }),
    seedRequest({
      title: "Keyboard for a new hire",
      description: "Our new hire would like a mechanical keyboard. Actually, they brought their own, so this may not be needed.",
      requesterId: "jordan",
      requesterUrgency: "medium",
      createdAt: ago(100),
      triage: {
        category: "laptops_hardware",
        urgency: "medium",
        summary: "New hire would like a mechanical keyboard.",
      },
      reviewed: { at: ago(99), by: "priya" },
      events: [
        assign(ago(99), "priya", "hannah"),
        move(ago(90), "jordan", "new", "closed", "cancelled_by_requester"), // the requester cancelled it
      ],
    }),
    seedRequest({
      title: "Renew the Slack contract",
      description: "Slack's annual contract is up for renewal in three weeks. Procurement wants quotes for the Business+ plan.",
      requesterId: "alex",
      requesterUrgency: "high",
      createdAt: ago(72),
      triage: {
        category: "vendor_contracts",
        urgency: "high",
        summary: "Slack contract renews soon.",
      },
      reviewed: {
        at: ago(70),
        by: "priya",
        change: { summary: "Renew Slack's annual contract within three weeks; get Business+ quotes." },
      },
      events: [
        assign(ago(70), "priya", "dana"),
        move(ago(66), "dana", "new", "in_progress"),
        move(ago(32), "dana", "in_progress", "done"),
      ],
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
  /** Ops reviewing the suggestion at `at`, with any fields they changed. */
  reviewed?: { at: Date; by: string; change?: Partial<TriageValues> };
  /** Assignments and status changes after creation, oldest first. */
  events?: HistoryEvent[];
}

/**
 * Builds a request whose status, assignee, and final triage are all
 * derived from its history, so they always agree, using the same event shapes
 * the services write.
 */
function seedRequest(input: SeedInput): RequestDoc {
  const { triage, createdAt, requesterId, reviewed } = input;
  const triagedAt = new Date(createdAt.getTime() + 5_000);
  const suggestion = "error" in triage ? null : triage;
  const failure = "error" in triage ? triage.error : null;
  const accepted = suggestion && reviewed ? { ...suggestion, ...reviewed.change } : null;

  const history: HistoryEvent[] = [
    { type: "created", at: createdAt, actorId: requesterId },
    failure === null
      ? { type: "triage_completed", at: triagedAt, actorId: requesterId, detail: { model: SEED_MODEL } }
      : { type: "triage_failed", at: triagedAt, actorId: requesterId, detail: { error: failure } },
    ...(input.events ?? []),
  ];
  if (accepted && reviewed) history.push(triageReviewEvent(suggestion, accepted, reviewed.by, reviewed.at));
  // The review was appended last; a stable sort puts it in time order.
  history.sort((a, b) => a.at.getTime() - b.at.getTime());

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
    triage: suggestion
      ? { status: "complete", suggestion, model: SEED_MODEL, error: null, attemptedAt: triagedAt }
      : { status: "failed", suggestion: null, model: SEED_MODEL, error: failure, attemptedAt: triagedAt },
    accepted,
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
