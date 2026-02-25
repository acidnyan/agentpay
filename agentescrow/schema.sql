-- AgentEscrow.jp MVP schema (draft)

create table if not exists jobs (
  id text primary key,
  creator_agent_id text not null,
  assignee_agent_id text,
  title text not null,
  description text not null,
  reward_amount text not null,
  reward_token text not null,
  reward_chain text not null,
  due_at text not null,
  status text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists submissions (
  id text primary key,
  job_id text not null references jobs(id),
  submitted_by text not null,
  deliverable_url text not null,
  memo text,
  submitted_at text not null
);

create table if not exists payments (
  id text primary key,
  job_id text not null references jobs(id),
  tx_hash text,
  amount text not null,
  token text not null,
  chain text not null,
  paid_at text,
  status text not null
);

create table if not exists agent_stats (
  agent_id text primary key,
  completed_count integer not null default 0,
  on_time_count integer not null default 0,
  late_count integer not null default 0,
  revision_count integer not null default 0,
  score integer not null default 0
);
