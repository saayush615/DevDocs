# Backend — Quick Reference Notes

---

## 1. Prisma schema (models, relations, indexes, enums, attributes)

**What it is:** `prisma/schema.prisma` describes your Postgres tables in Prisma language. Each `model` = one table, each field = one column.

**In simple words:** models are tables, scalar fields are columns, relation fields are links between tables. Attributes starting with `@` / `@@` add rules (keys, links, indexes, DB types).

---

### A. Relationships — all three shapes (same examples as Prisma docs)

Rule for all three: the side with `@relation(fields: ..., references: ...)` owns the foreign key (FK). The FK is a column that stores the `id` of a row in another table.

#### 1. One-to-many (1:n) — one user, many posts

```prisma
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
```

- FK lives on the "many" side: `Post.authorId` (each post points to exactly one user).
- `posts Post[]` on `User` is the back-relation: stores nothing in DB, just a way to query (`user.posts`).
- Our schema uses only this shape: `User → Session[]`, `User → Document[]`, `User → Conversation[]`, `Conversation → Message[]`.

Remember: 1:n = FK on many side + list field on one side.

#### 2. One-to-one (1:1) — one user, at most one profile

Same as 1:n, plus `@unique` on the FK. That one word turns "many" into "at most one".

```prisma
model Profile {
  id     Int    @id @default(autoincrement())
  bio    String
  userId Int    @unique
  user   User   @relation(fields: [userId], references: [id])
}
```

- Put the FK on the dependent side (the thing that cannot exist alone: profile needs a user, user needs no profile).
- No two profiles can point to the same user because `userId` is unique.

Remember: 1:1 = 1:n + `@unique` on the FK.

#### 3. Many-to-many (m:n) — many posts, many tags

One FK cannot point to many rows, so you add a third (junction) model: one row per pair.

```prisma
model Post {
  id    Int       @id @default(autoincrement())
  title String
  tags  PostTag[]
}

model Tag {
  id    Int       @id @default(autoincrement())
  label String    @unique
  posts PostTag[]
}

model PostTag {
  postId Int
  tagId  Int
  post   Post @relation(fields: [postId], references: [id])
  tag    Tag  @relation(fields: [tagId], references: [id])

  @@id([postId, tagId])
}
```

- Junction = two 1:n relations back to back.
- `@@id([postId, tagId])` = composite key, one record per pair, no duplicates.
- Junction can carry extra data about the pairing (e.g. `addedAt DateTime`).

Remember: m:n = junction model + two FKs + composite `@@id`.

---

### B. Indexing — `@@index` (make lookups fast)

An index is like a book's last-page keyword list: without it, Postgres scans every row; with it, it jumps straight to matching rows.

```prisma
model Document {
  id     String @id @default(cuid())
  userId String
  // ...
  @@index([userId])
}
```

- Our schema: `@@index([userId])` on `Document` and `Conversation`, `@@index([conversationId])` on `Message` — because we always query "all docs of this user" / "all messages of this chat".
- `@id` and `@unique` already make an index automatically — don't add `@@index` for those.
- Cost: faster reads, slightly slower writes + extra storage. Only index columns you filter/sort by often.

Remember: `@@index` = faster `WHERE`, paid with slower writes. Index your FKs.

---

### C. `enum` — fixed set of allowed values

Use when a field can only be one of a few words. DB rejects anything else.

```prisma
enum DocumentStatus {
  pending
  chunking
  embedded
  failed
}

enum MessageRole {
  user
  assistant
}

model Document {
  status DocumentStatus @default(pending)
}
```

- `Document.status` can only be those 4 words (matches PRD: `pending → chunking → embedded | failed`).
- `Message.role` can only be `user` / `assistant`.
- In Postgres this becomes a real `ENUM` type; in TypeScript it becomes a union of literals — type-safe end to end.

Remember: `enum` = dropdown list enforced by DB + checker.

---

### D. Field attributes

Attributes starting with single `@` apply to one field; `@@` (like `@@index`) apply to the whole model. Two you asked about:

#### 1. `@relation` — how tables are linked

```prisma
model Message {
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}
```

- `fields: [conversationId]` = my FK column. `references: [id]` = parent's column it points to.
- `onDelete: Cascade` = when the parent is deleted, delete children too (delete a conversation → its messages go away, delete a user → their docs/chats go away). Without it, delete would fail or orphan rows.
- The other side (`messages Message[]` on `Conversation`) is the back-relation — no attribute needed.

Remember: `@relation` = "this column is an FK to that table's id" + what to do on delete.

#### 2. `@db.Text` — which Postgres column type to use

```prisma
model Message {
  content String @db.Text
}
```

- Prisma's `String` needs a Postgres type. `@db.Text` forces `TEXT` (unlimited length) instead of `VARCHAR(n)` (limited length).
- Used for `Message.content` because chat answers can be very long. Titles/emails don't need it (short strings).
- Same family: `@db.VarChar(255)`, `@db.JsonB()`, etc. — all mean "use this exact native DB type".

Remember: `@db.Text` = long-text column for big content. `@relation` = link between tables.

> **One-line revision:** relations = FK links (1:n, 1:1 = 1:n + unique, m:n = junction). `@@index` = fast lookup. `enum` = fixed choices. `@relation` = which FK points where. `@db.Text` = unlimited-length string column.

---

