# Firebase Bingo Platform

An interactive, real-time platform for bingo competitions built with Firebase. This project provides a complete solution for hosting community bingo events, featuring a player-facing board, an admin verification panel, a live overview dashboard, and a powerful graphical setup editor.

## Key Features

*   **Real-Time Updates**: All data is synchronized in real-time using Firestore, ensuring players and admins always see the latest information.
*   **Secure Authentication**: Manages user access with Firebase Authentication (Google Sign-In), protecting sensitive admin and setup pages.
*   **Role-Based Permissions**: A flexible four-tier permission system (Admin, Event Mod, Captain, Player) controls who can perform which actions.
*   **Visual Board Editor**: A graphical interface (`setup.html`) for admins to visually arrange tiles, manage users, and configure all event settings directly in the browser.
*   **Direct Image Uploads**: Upload the board background and custom stamp images directly to Firebase Storage from the setup page.
*   **Live Overview Dashboard**: A public-facing page (`overview.html`) with a leaderboard, activity feed, and score-over-time chart that can be toggled on or off.

## Part 1: Firebase Setup

### Project Structure

The repository is organized into the following key files:

-   **`index.html`**: The main player-facing bingo board.
-   **`admin.html`**: The dashboard for admins/mods to manage users and verify submissions.
-   **`overview.html`**: The public-facing dashboard with leaderboards and activity charts.
-   **`setup.html`**: The powerful graphical editor for admins to configure the entire event.

-   **`auth.js`**: Handles all user authentication logic (sign-in, sign-out, role checking).
-   **`firebase-config.js`**: Contains the Firebase project configuration. **(Requires your keys)**.

-   **`firestore.rules`**: Security rules for the Firestore database.
-   **`storage.rules`**: Security rules for Firebase Storage (image uploads).

-   **`README.md`**: This file, containing setup and usage instructions.

### Step 1: Create and Configure Firebase Project

1.  **Create a Firebase Project**: Go to the Firebase Console and create a new project.
2.  **Add a Web App**: In your project dashboard, click the `</>` (Web) icon to register a web app. Copy the `firebaseConfig` object provided.
3.  **Enable Services**:
    *   **Authentication**: Go to `Build > Authentication`, click "Get started," and enable **Google** as a sign-in provider.
    *   **Firestore**: Go to `Build > Firestore Database`, create a database in **production mode**.
    *   **Storage**: Go to `Build > Storage` and get it started.
4.  **Update Project Config**:
    *   Open the `firebase-config.js` file.
    *   Paste your `firebaseConfig` object, replacing the placeholder values.

### Step 2: Set Security Rules

This project includes two files, `firestore.rules` and `storage.rules`, which contain the necessary security rules for the application.

1.  **Firestore Rules**:
    *   In the Firebase Console, navigate to `Build > Firestore Database > Rules`.
    *   Open the `firestore.rules` file from this project.
    *   Copy the entire contents of the file and paste it into the rules editor in the Firebase Console, replacing any existing rules.
    *   Click "Publish".

2.  **Storage Rules**:
    *   In the Firebase Console, navigate to `Build > Storage > Rules`.
    *   Open the `storage.rules` file from this project.
    *   Copy the entire contents of the file and paste it into the rules editor, replacing any existing rules.
    *   Click "Publish".

These rules are crucial for protecting your data and ensuring the role-based permission system works correctly.

## **Part 2: Data Migration (One-Time Step)**

If you have existing data in a Google Sheet, you need to migrate it to Firestore.

1.  **Export Sheets to CSV**: From your old Google Sheet, export the `Config` and `Tiles` sheets as separate CSV files (e.g., `config.csv`, `tiles.csv`) and place them in your project folder.
2.  **Run Migration Script**: A migration script (`migration-script.js`) is included to upload this data to Firestore. You will need to have Node.js installed.
    *   **Install Dependencies**: In your terminal, run `npm install firebase-admin csv-parser`.
    *   **Get Service Account Key**: In the Firebase Console, go to `Project Settings > Service Accounts`, and click "Generate new private key". Save the downloaded JSON file in your project folder.
    *   **Run the Script**: Execute the script from your terminal, pointing it to your service key file: `node migration-script.js`.

## **Part 3: Development & Deployment Workflow**

Your project's code (HTML, JS, CSS) lives in a Git repository, while your event's data (tiles, teams, submissions) lives in Firebase. The following workflow allows you to host your code and have it automatically update whenever you push changes to Git.

This project is designed to be managed in Git and deployed to Firebase Hosting.

### **Local Development**
To test the application on your local machine, you can use any simple web server. A popular choice is `serve`.
1.  Install `serve`: `npm install -g serve`
2.  Run the server from your project's root directory: `serve .`
3.  Open the provided local URL (e.g., `http://localhost:3000`) in your browser.

### **Deployment Options**
You can deploy the site manually for quick tests or set up automated deployments from GitHub for a seamless workflow. First, install the Firebase CLI: `npm install -g firebase-tools` and log in with `firebase login`.

#### **1. Manual Deployment (for testing)**
1.  **Initialize Project**: In your project's root directory, run `firebase init hosting`.
    *   Select "Use an existing project" and choose the Firebase project you created.
    *   What do you want to use as your public directory? Enter **`.`** (a single period for the current directory).
    *   Configure as a single-page app? **No**.
    *   Set up automatic builds and deploys with GitHub? **No** (we'll do this next).
2.  **Deploy**: Run `firebase deploy`. After a moment, the CLI will give you your live Hosting URL.

#### **2. Automated Deployment with GitHub (Recommended)**
This is the ideal workflow for a live event. Every time you push a change to your main branch on GitHub, it will automatically deploy to Firebase Hosting.

1.  **Push to GitHub**: Make sure your project is pushed to a GitHub repository.
2.  **Run Init Command**: In your project's root directory, run `firebase init hosting:github`.
3.  **Follow Prompts**:
    *   The CLI will ask you to authorize with GitHub.
    *   It will ask for your repository (`username/repo-name`).
    *   When asked "What script should be run before every deploy?", you can leave it blank and press Enter.
    *   It will ask to set up a workflow to deploy on push. Say **Yes**.
    *   It will ask which branch to deploy from. The default is `main`.
4.  **Done!**: The CLI will create a service account, add it as a secret to your GitHub repository, and create a `.github/workflows` directory with the deployment script. Now, any `git push` to your main branch will automatically update your live bingo site.

## **Part 4: How to Use**

All pages contain a navigation bar at the top to easily switch between the Player, Overview, and Admin views.

### **Player View**

* Players open the main Web app URL, select their team, and click on an unlocked tile.  
* They can fill out the form and update their submission as many times as they need.

### **Overview Page**

This page provides a public dashboard for the event, showing a leaderboard, a live feed of recent completions, and a chart of each team's score over time.

### **Board Setup Page**

This project includes a powerful **Board Setup** page that provides a graphical interface for editing the entire bingo board configuration. It is accessible from the main navigation bar.

#### **Features**

-   **Admin-Only Access**: Access is restricted to users authenticated with the `Admin` role.

#### ⚠️ **Security Warning**

The `setup.html` page provides full administrative control over the bingo board's configuration, including all styles, tiles, and event rules. Access is protected by Firebase Authentication, and only users with the `Admin` role (as defined in your Firestore `users` collection) can view and use this page.

Ensure that the `Admin` role is assigned only to trusted individuals. You can manage user roles from the **Admin View** page or by directly editing the documents in the `users` collection in the Firebase console.

### **Admin View**

This page is for managing user roles and verifying submissions. Access is restricted to authenticated users with the `Captain`, `Event Mod`, or `Admin` role.
*   **Log in** with an authorized Google account.
*   **User Management**: Admins and Event Mods can assign roles and teams to users. Captains can assign players to their own team.
*   **Submission Review**: Event Mods and Admins will see a list of all submissions. You can filter them by status, click any row to open an edit modal, and update the verification status.

All data management is done through the web interface; editing external spreadsheets is no longer part of the workflow.

## **Note on AI Generation**

This project was created collaboratively with Google's Gemini. While the logic and functionality have been guided and tested by a human developer, much of the boilerplate code and documentation was AI-generated.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

