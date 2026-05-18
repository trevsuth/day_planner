# ToDo Items

## 1. Immediate

1. Commit and push the API Reference tab changes
2. Create Playwright smoke tests for the web app
   - Load Planner
   - Load Projects
   - Open the API Reference tab
   - Create a project
   - Create and edit a card
   - Drag a card between Kanban columns
   - Open Timeline, Gantt, and Calendar views

## 2. Project Manager

1. Add project filters and search
   - Filter Kanban by epics, features, stories, and subtasks
   - Filter by status, blocked, overdue, due soon, and unassigned dates
   - Add text search across project/card title, description, comments, and deliverables
2. Improve mouseless navigation in the web interface
   - Do this without cluttering the UI
   - Add shortcuts for switching project views
   - Add selection movement with keyboard commands
   - Add quick search focus
   - Add open/close/save card shortcuts
3. Add saved view state
   - Remember active project
   - Remember active project view
   - Remember filters and search text
4. Add card dependencies
   - Track blocked-by relationships separately from parent-child hierarchy
   - Surface dependency warnings in Roadmap, Timeline, Gantt, and Calendar
5. Add activity history / audit log
   - Track status changes
   - Track date changes
   - Track parent changes
   - Track comment changes
6. Add bulk edit actions
   - Bulk status change
   - Bulk date change
   - Bulk card type change where hierarchy rules allow it
7. Create an Artifact Repository / wiki
   - Attach reference notes to projects or cards
   - Link artifacts from card comments

## 3. Planner

1. Investigate planner and project manager linking
   - Link daily planner tasks to project cards
   - Generate planner tasks from project cards
   - Show scheduled project work in the planner
   - Optionally update project card status when linked planner tasks are completed
2. Improve TUI card navigation
   - Make card selection clearer
   - Add jump-to-card or search in the TUI
   - Reduce friction when moving between card list and edit fields
3. Add recurring planner tasks
   - Daily, weekly, monthly recurrence
   - Optional end date
   - Skip/completion behavior

## 4. Data and Platform

1. Enable database import/export
   - JSON export
   - JSON import
   - Backup/restore workflow
2. Add a versioned database migration strategy
   - Replace ad hoc schema updates with ordered migrations
   - Track applied migration version
3. Enable use of an external database
   - Configurable database path first
   - Consider Postgres later only if needed
4. Create MCP server
   - Expose planner entries
   - Expose projects and cards
   - Support safe create/update actions

## 5. Completed

1. [x] Add Start Date to Card
2. [x] Add Timeline
3. [x] Create Gantt chart view
4. [x] Create Calendar View
5. [x] Enable drag and drop of cards between columns in Kanban
6. [x] Enable Markdown/MMD support in card comments
