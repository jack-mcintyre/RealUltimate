Biweekly Progress Report: RealUltimate

Figure 1: Gantt Chart
*(Insert updated Gantt Chart here)*

Figure 2: GIT Commits
*(Insert screenshot of recent GitHub commits here)*

1. Provide an update on your progress according to your Gantt chart in the proposal; provide over/under of your progress vs plan:
We are currently in Week 7, concluding Phase 2 and entering Phase 3 (Spectator Sync & UI Polish). The tasks for this sprint were as follows:
a. Task 2.4: Finalize Game Logic (Individual Player Stats & Line Management)
b. Task 3.1: Build Polished Roster Management UI
c. Task 3.2: Implement Game Registration Flow (Coach & Opponent Sync)
d. Task 3.3: Build "Live Feed" Spectator View
We are on schedule.     

2. Provide an update of teamwork: who is doing which tasks;
We (Jack, Damien, and Brehon) divided the UI components, service integrations, and core logic algorithms. Subtasks and their status are as follows:

Team Member | Task | Status
--- | --- | ---
Jack | Build Roster Management UI (`roster.tsx`) | Complete
Jack | Build Spectator Live Feed UI (`live-feed.tsx`) | Complete
Brehon | Implement Game Registration UI (`recorder.tsx`) | Complete
Brehon | Implement Spectator Sync Data Service (`LiveFeedService.ts`) | Complete
Damien | Refactor Game Models for Player Stats (`types.ts`, `useGame.ts`) | Complete
Damien | Implement Player Validation and Stat Tracking Algorithms (`GameLogic.ts`) | Complete
Jack | Finalize CSS Styling & Responsive Layouts (Phase 4) | In Progress, 10% Complete
Brehon | Connect Auth Flow to Navigation Guards | In Progress, 15% Complete
Damien | Implement "Reset Game" and "End Game" backend logic | Not Started

*(Insert screenshots of the new Roster, Recorder, and Live Feed screens here)*

3. If any new bottleneck/hurdle is discovered, please describe; also describe your solution to address the hurdle
One major hurdle we encountered was setting up secure Firebase Realtime Database rules. By default, Firebase blocked our backend from creating Teams because we were passing a mocked Coach ID before fully wiring up the Login system. To solve this, we updated our rules to require active Authentication (`auth != null`) and updated our components to retrieve and pass the actual logged-in user's Firebase UID (`auth.currentUser.uid`) when communicating with the database.

Another technical bottleneck involved React crashing on the Live Feed screen because `activeGame.history` was undefined. We discovered a Firebase quirk where it automatically deletes empty arrays to save space. We resolved this by implementing fallback logic in our frontend components to safely default to an empty array when rendering history before the first event of a game occurs.

4. If you are behind schedule, please provide a plan to address
NA-Not behind Schedule.

5. Describe your next step for the next 2 weeks.
In the following weeks, we will focus on polishing the entire application and beginning Phase 4 (Final Presentation & Polish). 
- **Jack** will focus on refining the styling and layout of the core screens (Roster, Recorder, Live Feed) to ensure they are fully responsive and visually appealing according to our initial design proposal.
- **Brehon** will be tasked with integrating the existing Firebase Authentication screens (Login/Register) seamlessly into the app flow so that users are forced to log in before accessing the tabs.
- **Damien** will work on final end-to-end integration testing, finding and fixing any state synchronization bugs in the undo stack, and ensuring the database rules are completely secure for a production-like environment.
