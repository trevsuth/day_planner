# ToDo Items

## 1. Immediate

1. Create Playwright smoke tests for the web app
   - Load Planner
   - Load Projects
   - Open the API Reference tab
   - Create a project
   - Create and edit a card
   - Drag a card between Kanban columns
   - Open Timeline, Gantt, and Calendar views
   - Assign a project card to a future planner priority
   - Create a dependency date conflict and verify the Issues view
2. Add a versioned database migration strategy
   - Replace ad hoc schema updates with ordered migrations
   - Track applied migration version
   - Add migration tests for existing planner and project databases
## 2. Project Manager

1. [x] Add project filters and search
   - Filter Kanban by epics, features, stories, and subtasks
   - Filter by status, blocked, overdue, due soon, and unassigned dates
   - Add text search across project/card title, description, comments, and deliverables
2. [x] Improve mouseless navigation in the web interface
   - Do this without cluttering the UI
   - Add shortcuts for switching project views
   - Add selection movement with keyboard commands
   - Add quick search focus
   - Add open/close/save card shortcuts
3. [x] Add saved view state
   - Remember active project
   - Remember active project view
   - Remember filters and search text
4. [x] Add card dependencies
   - Track blocked-by relationships separately from parent-child hierarchy
   - Surface dependency warnings in Roadmap, Timeline, Gantt, and Calendar
   - Add Issues view for blocked dependencies and dependency date conflicts
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
8. Add dependency graph view
   - Visualize blocked-by relationships separately from hierarchy
   - Highlight blocked chains and date conflicts
   - Open cards directly from graph nodes
9. Add card templates
   - Template common epic, feature, story, and subtask structures
   - Pre-fill deliverables, descriptions, and starter child cards

## 3. Planner

1. Investigate planner and project manager linking
   - [x] Assign project cards to planner priorities for future dates
   - Store a durable link from planner priority back to the project card
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
4. Add planner capacity warnings
   - Warn when future priorities are already full
   - Surface cards assigned to the same date
   - Suggest open planning dates based on due date and dependency timing

## 4. Data and Platform

1. Enable database import/export
   - JSON export
   - JSON import
   - Backup/restore workflow
2. Enable use of an external database
   - Configurable database path first
   - Consider Postgres later only if needed
3. Create MCP server
   - Expose planner entries
   - Expose projects and cards
   - Support safe create/update actions
4. Add structured application settings
   - [x] Configure database paths
   - Configure CORS/frontend hostnames
   - Share settings between local, packaged, and Docker runs

## 5. Completed

1. [x] Add Start Date to Card
2. [x] Add Timeline
3. [x] Create Gantt chart view
4. [x] Create Calendar View
5. [x] Enable drag and drop of cards between columns in Kanban
6. [x] Enable Markdown/MMD support in card comments
7. [x] Add API Reference tab
8. [x] Add Docker Compose hosting
