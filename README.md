# Firebase Bingo Platform

An interactive, real-time platform for bingo competitions built with Firebase. This project provides a complete solution for hosting community bingo events, featuring a player-facing board, an admin verification panel, a live overview dashboard, and a powerful graphical setup editor.

## Key Features

*   **Real-Time Updates**: All data is synchronized in real-time using Firestore, ensuring players and admins always see the latest information.
*   **Secure Authentication**: Manages user access with Firebase Authentication (Google Sign-In), protecting sensitive admin and setup pages.
*   **Role-Based Permissions**: A flexible four-tier permission system (Admin, Event Mod, Captain, Player) controls who can perform which actions.
*   **Visual Board Editor**: A graphical interface (`setup.html`) for admins to visually arrange tiles, manage users, and configure all event settings directly in the browser.
*   **Mass Tile Import/Export**: A dedicated page (`import.html`) to bulk import tiles from a CSV file with dynamic column mapping, and export all existing tiles to a CSV.
*   **Direct Image Uploads**: Upload the board background and custom stamp images directly to Firebase Storage from the setup page.
*   **Live Overview Dashboard**: A public-facing page (`overview.html`) with a leaderboard, activity feed, and score-over-time chart that can be toggled on or off.

## Part 1: Firebase Setup

### Project Structure

The repository is organized into the following key files:

-   **`index.html`**: The main player-facing bingo board.
-   **`admin.html`**: The dashboard for admins/mods to manage users and verify submissions.
-   **`overview.html`**: The public-facing dashboard with leaderboards and activity charts.
-   **`setup.html`**: The powerful graphical editor for admins to configure the entire event.
-   **`import.html`**: The page for bulk importing and exporting tile data.

-   **`auth.js`**: Handles all user authentication logic (sign-in, sign-out, role checking).
-   **`firebase-config.js`**: Contains the Firebase project configuration. **(Requires your keys)**.
-   **`firebase-config.example.js`**: A template for the configuration file.
-   **`.gitignore`**: Specifies files for Git to ignore, like your config and private notes.
-   **`firestore.rules`**: Security rules for the Firestore database.
-   **`storage.rules`**: Security rules for Firebase Storage (image uploads).

-   **`README.md`**: This file, containing setup and usage instructions.

### Step 1: Create and Configure Firebase Project

1.  **Create Firebase Project**: Go to the Firebase Console and create a new project.
2.  **Prepare Local Config File**:
    *   In your project folder, create a copy of `firebase-config.example.js` and rename it to `firebase-config.js`. This file will hold your project keys and is already listed in `.gitignore` to keep them secure.
3.  **Add a Web App & Get Keys**:
    *   In your project's dashboard, click the `</>` (Web) icon to register a new web app. Give it an easy-to-type nickname (e.g., `bingo-app`). This is for your reference in the console and is not user-facing.
    *   Leave "Also set up Firebase Hosting for this app." unchecked. This will be handled later during deployment.
    *   After registering, you will see an "Add Firebase SDK" section with two options: **npm** and **`<script>`**. This project uses direct imports, so select the **`<script>`** tab to see your configuration keys.
    *   Open your local `firebase-config.js` file and replace the placeholder `firebaseConfig` object with the one from the console.
        > **Important:** Copy only the object itself (from `const firebaseConfig = {` to the closing `};`), not the entire script with `import` statements.
4.  **Enable Backend Services**:
    *   **Authentication**:
        *   Go to `Build > Authentication` and click "Get started."
        *   On the "Sign-in method" tab, select **Google** from the list of providers.
        *   Enable the Google provider by flipping the switch.
        *   The "Public-facing name" will be pre-filled (e.g., `project-12345`). It's recommended to change this to your event's name (e.g., "Community Bingo").
        *   Select a "Project support email" from the dropdown.
        *   Click "Save". You can leave all other settings (like Authorized Domains) as they are.
    *   **Firestore**:
        *   Go to `Build > Firestore Database` and click "Create database".
        *   If prompted to select an edition, choose **Standard** (this project uses Firestore in Native Mode).
        *   You will be asked to choose a Cloud Firestore location. This is a critical step.
            > **Important:** The location you choose for Firestore will also be the default location for Firebase Storage. For the free "Spark" plan, they **must** be in the same location.
        *   A US-based multi-region like **`nam5 (United States)`** is a safe choice that is compatible with free-tier Storage.
        *   Select **Production mode** and click "Next".
        *   Click "Enable".
    *   **Storage**:
        *   Go to `Build > Storage` and click "Get started".
        *   You will likely be prompted to upgrade your project to the **Blaze (pay-as-you-go) plan**. This is required for Cloud Storage but still includes a generous free tier. You will need to add a billing account to proceed.
        *   **Recommended: Set a Budget Alert**: To prevent accidental charges, it's highly recommended to set a budget alert immediately after enabling billing.
            1.  Go to the Google Cloud Console Budgets page.
            2.  Click **Create Budget**.
            3.  Give it a name (e.g., "Firebase Zero Spend Alert") and ensure it's applied to your project.
            4.  Under "Budget amount", select "Specified amount" and enter `1` as the target amount (the lowest possible).
            5.  Under "Actions", set an alert threshold for **100%** of the budget for "Actual" cost. This will email you if your spending exceeds $1, giving you peace of mind.
        *   **Finalize Storage Setup**:
            *   Return to the Firebase Storage page and click "Get started" again if needed.
            *   You will be asked for a Cloud Storage location. To stay within the free tier allowances and ensure compatibility with your Firestore location (`nam5`), choose a US-based location like **`us-central1`**.
            *   Click "Done". You can accept the default security rules for now, as they will be updated in the next step.

### Step 2: Set Security Rules

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

## Part 2: Local Development & Deployment

You cannot open the `index.html` file directly in your browser. This project uses JavaScript modules, which require the files to be served by a web server. You can either run a local server for testing or deploy the site to Firebase Hosting.

> **Prerequisite: Node.js**
> The following steps require Node.js and its package manager, npm.
> *   Download and install the **LTS** (Long-Term Support) version from nodejs.org.
> *   **Important**: During installation, ensure the option to "Add to PATH" is selected. This allows you to run `npm` commands from any terminal, including the one inside VS Code.
> *   After installation, close and reopen your terminal (or VS Code entirely) for the changes to take effect.

### Local Development (Recommended for Setup)
To test the application on your local machine, you can use a simple web server like `serve`.
1.  **Install `serve`**: In your terminal, run `npm install -g serve`.
2.  **Run the server**: From your project's root directory, run `serve .`
3.  **Open the App**: The terminal will provide a local URL (e.g., `http://localhost:3000`). Open this URL in your browser.

### Deployment to Firebase Hosting
You can deploy the site manually for quick tests or set up automated deployments from GitHub for a seamless workflow.

First, install the Firebase CLI: `npm install -g firebase-tools` and log in with `firebase login`.

#### Option 1: Manual Deployment
1.  **Initialize Project**: In your project's root directory, run `firebase init hosting`.
    *   Select "Use an existing project" and choose the Firebase project you created.
    *   For your public directory, enter **`.`** (a single period for the current directory).
    *   Configure as a single-page app? **No**.
    *   Set up automatic builds and deploys with GitHub? **No**.
2.  **Deploy**: Run `firebase deploy`. The CLI will give you your live Hosting URL.

#### Option 2: Automated Deployment with GitHub (Production Workflow)
This is the ideal workflow for a live event. Every time you push a change to your main branch on GitHub, it will automatically deploy to Firebase Hosting.

1.  **Push to GitHub**: Make sure your project is pushed to a GitHub repository.
2.  **Run Init Command**: In your project's root directory, run `firebase init hosting:github`.
3.  **Follow Prompts**:
    *   Authorize with GitHub and select your repository (`username/repo-name`).
    *   When asked "What script should be run before every deploy?", leave it blank and press Enter.
    *   Set up a workflow to deploy on push? **Yes**.
    *   Choose the branch to deploy from (e.g., `main`).
4.  **Done!**: The CLI creates a `.github/workflows` directory. Now, any `git push` to your main branch will automatically update your live site.

## Part 3: Initial Admin Setup (Crucial Step)

After setting up your Firebase project and serving the application (either locally or by deploying it), you must assign an `Admin` role to your own user account to access the `admin.html` and `setup.html` pages.

1.  **Open the App**: Open the application using your local server URL (e.g., `http://localhost:3000`) or your deployed Firebase Hosting URL.
2.  **Log In**: Click the "Login with Google" button and sign in with the account you want to be the administrator. This action creates your user profile in the Firestore database.
3.  **Go to Firestore**: In the Firebase Console, navigate to `Build > Firestore Database`.
4.  **Find Your User**: You should see a `users` collection. Click on it, then find the document that has an `email` field matching your email address.
5.  **Update Your Role**:
    *   Click on your user document to view its fields.
    *   Find the `isAdmin` field (it should be a boolean set to `false`).
    *   Change the value from `false` to `true` and click "Update".
6.  **Refresh the App**: Go back to the application tab and refresh the page. You should now see the "Admin" and "Setup" links in the navigation bar.

## Part 4: How to Use

All pages contain a navigation bar at the top to easily switch between the Player, Overview, and Admin views.

### **Player View**

* Players open the main Web app URL, select their team, and click on an unlocked tile.  
* They can fill out the form and update their submission as many times as they need.

### **Overview Page**

This page provides a public dashboard for the event, showing a leaderboard, a live feed of recent completions, and a chart of each team's score over time. It can be disabled by an admin in the `setup.html` page.

### **Board Setup Page (`setup.html`)**

This is the central hub for event administrators. It provides a graphical interface for editing the entire bingo board configuration and is accessible only to users with the `Admin` role.

#### **Features**

-   **Live Tile Editor**: Drag, resize, and edit tiles directly on a visual representation of the board. All changes are saved automatically.
-   **Global Configuration**: Edit event-wide settings like the page title, board background image, and gameplay rules.
-   **Team Management**: Create, rename, and delete teams.
-   **Mass Import / Export**: A link to the dedicated `import.html` page to manage tiles in bulk.
-   **Mass Deletion**: A "Delete All Tiles" button with a strong confirmation modal to safely clear the board.

#### ⚠️ **Security Warning**

The `setup.html` page provides full administrative control over the bingo board's configuration. Access is protected by Firebase Authentication, and only users with the `Admin` role can view and use this page. Ensure that the `Admin` role is assigned only to trusted individuals.

### **Import/Export Page (`import.html`)**

This page provides powerful tools for managing tile data in bulk. It is accessible from the **Board Setup** page and is restricted to `Admin` users.

-   **Export to CSV**: Download all current tiles into a single CSV file. This file serves as a perfect template for editing and re-importing.
-   **Import from CSV**:
    -   **Column Mapping**: After uploading a CSV, you can dynamically map columns from your file to the required tile attributes (e.g., `id`, `Name`, `Points`).
    -   **Import Modes**: Choose how to handle tiles from your CSV that have the same ID as existing tiles on the board:
        -   `Create new & reject duplicates` (Default): A safe option that prevents accidental overwrites.
        -   `Create new & overwrite duplicates`: Useful for updating existing tiles in bulk.
    -   **Validation & Feedback**: The tool validates data before importing and provides detailed success and failure lists after the operation is complete.

### **Admin View**

This page is for managing user roles and verifying submissions. Access is restricted to authenticated users with the `Captain`, `Event Mod`, or `Admin` role.
*   **Log in** with an authorized Google account.
*   **User Management**: Admins and Event Mods can assign roles and teams to users. Captains can assign players to their own team.
*   **Submission Review**: Event Mods and Admins will see a list of all submissions. You can filter them by status, click any row to open an edit modal, and update the verification status.

### **Data Management**

With the introduction of the **Import/Export Page**, managing data is now primarily done through the web interface.

-   **For New Events**: The recommended workflow is to use the `setup.html` page for initial configuration and the `import.html` page for bulk-adding tiles from a CSV.
-   **For Data Migration**: The old `migration-script.js` is still available for developers comfortable with Node.js or for migrating from a specific legacy Google Sheets format. However, for most use cases, exporting your old data to CSV and using the new import tool is the easier path.

## Note on AI Generation

This project was created collaboratively with Google's Gemini. While the logic and functionality have been guided and tested by a human developer, much of the boilerplate code and documentation was AI-generated.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
