-- Sprint Board: adds board_status to tasks, separate from backlog_status.
-- backlog_status moves to 'in_sprint' and stays there once an item is
-- assigned into a sprint; board_status is the finer-grained todo/in
-- progress/done tracking within that sprint, set to 'todo' at assignment
-- time and then moved along by the Kanban board.
--
-- No new table needed - sprints already exists (Product Backlog phase),
-- and tasks already has sprint_id pointing to it.

alter table tasks add column if not exists board_status text
  check (board_status is null or board_status in ('todo', 'in_progress', 'done'));
