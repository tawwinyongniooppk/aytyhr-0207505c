
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can subscribe to their own attendance leave channel" ON realtime.messages;
CREATE POLICY "Users can subscribe to their own attendance leave channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'att-leave-' || (SELECT auth.uid())::text
);
