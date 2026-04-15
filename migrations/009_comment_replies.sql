-- Thread-level chat: replies on annotation pin comments
CREATE TABLE IF NOT EXISTS comment_replies (
  id          TEXT        PRIMARY KEY,
  comment_id  TEXT        NOT NULL REFERENCES markup_comments(id) ON DELETE CASCADE,
  user_name   TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comment_replies_comment_id_idx ON comment_replies(comment_id);
