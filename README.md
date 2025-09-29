# Firebase Bingo Platform

An interactive, real-time platform for bingo competitions built with Firebase. This project provides a complete solution for hosting community bingo events, featuring a player-facing board, an admin verification panel, a live overview dashboard, and a powerful graphical setup editor. It has been refactored into a modern, modular architecture for improved maintainability and scalability.

## Key Features

*   **Real-Time Updates**: All data is synchronized in real-time using Firestore, ensuring players and admins always see the latest information.
*   **Modular & Maintainable**: The codebase is broken down into core services, reusable UI components, and page-specific controllers, making it easy to manage and extend.
*   **Secure Authentication**: Manages user access with Firebase Authentication (Google & Anonymous), protecting sensitive admin and setup pages.
*   **Role-Based Permissions**: A flexible four-tier permission system (Admin, Event Mod, Captain, Player) controls who can perform which actions.
*   **Visual Board Editor**: A graphical interface (`setup.html`) for admins to visually arrange tiles, manage users, and configure all event settings directly in the browser.
*   **Mass Data Import/Export**: Dedicated pages to bulk import/export tiles, config, and submissions via CSV.
*   **Live Overview Dashboard**: A public-facing page (`overview.html`) with a leaderboard, activity feed, and score-over-time chart that can be toggled on or off.
*   **Automated Deployments**: Pre-configured GitHub Actions workflows for automatically deploying the site on pushes to `main` and creating preview deployments for pull requests.

## Part 1: Firebase Setup

### New Project Structure

The repository has been refactored into a modular structure that separates concerns.

*   **`/` (Root)**: Contains all the `.html` pages, Firebase rules, and project documentation.
*   **`.github/workflows/`**: Contains example templates for automated deployment via GitHub Actions.
*   **`js/core/`**: Central, shared logic.
    *   `auth.js`: Manages user authentication.
    *   `utils.js`: Shared helper functions (e.g., `showMessage`).
    *   `data/`: Modules for managing specific Firestore collections (e.g., `tileManager.js`, `userManager.js`).
    *   `firebase-config.js`: **(Requires your keys)** Contains the Firebase project configuration.
    *   `firebase-config.example.js`: A template for the configuration file.
*   **`js/components/`**: Reusable UI elements.
    *   `Navbar.js`: The universal navigation bar used on every page.
    *   `TileRenderer.js`: Logic for rendering a single bingo tile consistently.
    *   `Scoreboard.js`: Logic for calculating and rendering the scoreboard.
*   **`js/pages/`**: Page-specific logic. Each `.html` file has a corresponding controller here (e.g., `indexController.js` for `index.html`).

### Step 1: Create and Configure Firebase Project

1.  **Create Firebase Project**: Go to the Firebase Console and create a new project.
2.  **Prepare Local Config File**:
    *   In your project folder, create a copy of `js/core/firebase-config.example.js` and rename it to `js/core/firebase-config.js`. This file will hold your project keys and is already listed in `.gitignore` to keep them secure.
3.  **Add a Web App & Get Keys**:
    *   In your project's dashboard, click the `</>` (Web) icon to register a new web app. Give it an easy-to-type nickname (e.g., `bingo-app`). This is for your reference in the console and is not user-facing.
    *   Leave "Also set up Firebase Hosting for this app." unchecked. This will be handled later during deployment.
    *   After registering, you will see an "Add Firebase SDK" section with two options: **npm** and **`<script>`**. This project uses direct imports, so select the **`<script>`** tab to see your configuration keys.
    *   Open your local `js/core/firebase-config.js` file and replace the placeholder `firebaseConfig` object with the one from the console.
        > **Important:** Copy only the object itself (from `const firebaseConfig = {` to the closing `};`), not the entire script with `import` statements.
4.  **Enable Backend Services**:
    *   **Authentication**:
        *   Go to `Build > Authentication` and click "Get started."
        *   On the "Sign-in method" tab, select **Google** from the list of providers.
        *   Enable the Google provider.
        *   The "Public-facing name" will be pre-filled (e.g., `project-12345`). It's recommended to change this to your event's name (e.g., "Community Bingo").
        *   Select a "Project support email" from the dropdown.
        *   Click "Save". You can leave all other settings (like Authorized Domains) as they are.
        *   (Optional) From the "Sign-in method" tab, also enable the **Anonymous** provider. No extra configuration is needed for it.
    *   **Firestore Database**:
        *   Go to `Build > Firestore Database` and click "Create database".
        *   Choose **Start in production mode**.
        *   Select a Cloud Firestore location. A US-based multi-region like **`nam5 (United States)`** is a safe choice that is compatible with free-tier Storage.
        *   Click "Enable".
    *   **Firestore (Legacy - ignore if you see the above)**:
        *   Go to `Build > Firestore Database` and click "Create database".
        *   If prompted to select an edition, choose **Standard** (this project uses Firestore in Native Mode).
        *   You will be asked to choose a Cloud Firestore location. This is a critical step.
        *   A US-based multi-region like **`nam5 (United States)`** is a safe choice.

### Step 2: Set Security Rules

1.  **Firestore Rules**:
    *   In the Firebase Console, navigate to `Build > Firestore Database > Rules`.
    *   Open the `firestore.rules` file from this project.
    *   Copy the entire contents of the file and paste it into the rules editor in the Firebase Console, replacing any existing rules.
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
This is the ideal workflow for a live event. It allows you to push changes to your main branch on GitHub and have them automatically deploy to Firebase Hosting.
This template includes example workflow files in `.github/workflows/` that make this process straightforward.

**Core Concepts for Reusability**

The automated deployment relies on two types of secrets stored in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

1.  `FIREBASE_CONFIG_JS`: You create this manually. It holds your web app keys.
2.  `FIREBASE_SERVICE_ACCOUNT_...`: This is created *automatically* when you link your repository to Firebase.

**Crucially, these secrets are NOT copied when someone forks the repository.** This is a security feature. Therefore, every person who forks this project must perform the following setup steps on their own repository to connect it to their own Firebase project.

**One-Time Setup Steps (For the original owner AND for each new fork):**

1.  **Clone Your Repository**: If you have just forked this project, clone *your fork* to your local machine.
    ```bash
    git clone https://github.com/YOUR_USERNAME/YOUR_FORKED_REPO_NAME.git
    cd YOUR_FORKED_REPO_NAME
    ```
2.  **Copy Example Workflows**:
    *   In the `.github/workflows/` directory, make copies of the example files:
        *   Copy `firebase-hosting-merge.example.yml` to `firebase-hosting-merge.yml`.
        *   Copy `firebase-hosting-pr.example.yml` to `firebase-hosting-pr.yml`.
    *   These files are already ignored by `.gitignore` so you won't commit your project-specific details.
2.  **Set Up `FIREBASE_CONFIG_JS` Secret**:
    *   In *your* GitHub repository, go to `Settings > Secrets and variables > Actions`.
    *   Click "New repository secret".
    *   **Name**: `FIREBASE_CONFIG_JS`
    *   **Value**: Copy the *entire contents* of your local `js/core/firebase-config.js` file and paste it here.
    *   Click "Add secret".

4.  **Initialize Firebase Hosting Locally**:
    *   In your terminal, from the project's root directory, run the following to create the `firebase.json` and `.firebaserc` files:
        ```bash
        firebase init hosting
        ```
    *   **Follow the prompts:**
        *   Select "Use an existing project" and choose your Firebase project.
        *   For your public directory, enter **`.`** (a single period for the current directory).
        *   Configure as a single-page app? **No**.
        *   Set up automatic builds and deploys with GitHub? **No** (we will do this in the next step).
        *   When asked `File ./index.html already exists. Overwrite?`, choose **No**. This preserves the project's main HTML file.

5.  **Link Repository to Firebase for GitHub Actions**:
    *   This critical step creates the `FIREBASE_SERVICE_ACCOUNT_...` secret in your GitHub repository. In your terminal, run:
        ```bash
        firebase init hosting:github
        ```
    *   **Follow the prompts:**
        *   Authorize with GitHub and select *your* repository (`YOUR_USERNAME/YOUR_FORKED_REPO_NAME`).
        *   When asked "What script should be run before every deploy?", leave it blank and press Enter.
        *   Set up a workflow to deploy on push? **Yes**.
        *   Choose the branch to deploy from (e.g., `main`).
        *   When asked to overwrite the workflow file, choose **Yes**.

6.  **Update Workflow Files with Your Project ID**:
    *   Open your new `firebase-hosting-merge.yml` and `firebase-hosting-pr.yml` files.
    *   In both files, find the `projectId` and `firebaseServiceAccount` lines.
    *   Replace `YOUR_PROJECT_ID` with your actual Firebase Project ID. The service account secret name should also be updated to match the one that was just created for you.

7.  **Commit and Push**: Commit the new Firebase config files to your repository.
    ```bash
    git add firebase.json .firebaserc
    git commit -m "Configure GitHub Actions for Firebase deployment"
    git push
    ```
    Any future `git push` to your main branch will now automatically and securely deploy your site using the workflows you configured.

## Part 3: Accessing Your Site

**Important Note:** After setting up automated deployments, the Firebase Console's Hosting page might still show a "Get started" button. This is normal. The Hosting dashboard will fully populate with your site's information and deployment history **only after the first successful deployment** is completed by the GitHub Action.

1.  **Trigger the First Deployment**: The `git push` command you ran in the previous step will have triggered the first deployment. You can monitor its progress in your GitHub repository under the "Actions" tab.

2.  **Find Your URL**: Once the deployment is successful (you'll see a green checkmark in GitHub Actions), go to the Firebase Console and navigate to `Build > Hosting`. The dashboard will now be active, and you will see your default URLs (e.g., `your-project-id.web.app`).

### Connecting a Custom Domain

If you own a domain name (e.g., `mybingoevent.com`), you can connect it for a professional-looking URL.

1.  **Go to the Hosting Dashboard**: In the Firebase Console, navigate to the `Hosting` section.
2.  **Add Custom Domain**: Click the "Add custom domain" button.
3.  **Enter Your Domain**: Type in the domain you want to connect (e.g., `www.mybingoevent.com`). It's generally recommended to add the `www` version and also redirect the root domain (`mybingoevent.com`) to it.
4.  **Verify Ownership**: Firebase will provide you with a TXT record. You must add this record to your domain's DNS settings through your domain registrar (e.g., GoDaddy, Namecheap, Google Domains). This proves you own the domain.
    *   This step can take some time to propagate, from a few minutes to several hours. Firebase will periodically check for the record.
5.  **Add A Records**: Once your domain is verified, Firebase will provide you with one or more IP addresses (A records). Go back to your domain registrar's DNS settings and add these A records for your domain. This points your domain to Firebase's servers.
6.  **Wait for Provisioning**: After adding the A records, it will take some time for the SSL certificate to be provisioned and for the domain to become fully active. Firebase will show the status as "Pending" and then "Connected".

## Part 4: Initial Admin Setup (Crucial Step)

After setting up your Firebase project and serving the application (either locally or by deploying it), you must assign an `Admin` role to your own user account to access the `admin.html` and `setup.html` pages.

1.  **Open the App**: Open the application using your local server URL (e.g., `http://localhost:3000`) or your deployed Firebase Hosting URL.
2.  **Log In**: Click the "Login with Google" button and sign in with the account you want to be the administrator. This action creates your user profile in the Firestore database.
3.  **Go to Firestore**: In the Firebase Console, navigate to `Build > Firestore Database > Data`.
4.  **Find Your User**: You should see a `users` collection. Click on it, then find the document that has an `email` field matching your email address.
    > **Note:** If your user document doesn't have an email field, you can find your User ID (UID) by logging in and visiting the `troubleshoot.html` page. The UID will be listed under the "Authentication" check.
5.  **Update Your Role**:
    *   Click on your user document to view its fields.
    *   Find the `isAdmin` field (it should be a boolean set to `false`).
    *   Change the value from `false` to `true` and click "Update".
6.  **Refresh the App**: Go back to the application tab and refresh the page. You should now see the "Admin" and "Setup" links in the navigation bar.

## Part 5: How to Use

All pages contain a universal navigation bar at the top to easily switch between the Player, Overview, and Admin views.

### **Player View**

*   Players open the main Web app URL, select their team, and click on an unlocked tile.
* They can fill out the form and update their submission as many times as they need.

### **Overview Page**

This page provides a public dashboard for the event, showing a leaderboard, a live feed of recent completions, and a chart of each team's score over time. It can be disabled by an admin in the `setup.html` page.

### **Board Setup Page (`setup.html`)**

This is the central hub for event administrators. It provides a graphical interface for editing the entire bingo board configuration and is accessible only to users with the `Admin` role.

#### **Features**

-   **Live Tile Editor**: Drag, resize, and edit tiles directly on a visual representation of the board. All changes are saved automatically.
-   **Global Configuration**: Edit event-wide settings like the page title, board background image, and gameplay rules.
-   **Team Management**: Create, rename, and delete teams.
-   **Mass Import / Export**: Links to dedicated pages to manage tiles, config, and submissions in bulk. All image fields require a direct web URL.
-   **Mass Deletion**: A "Delete All Tiles" button with a strong confirmation modal to safely clear the board.

#### ⚠️ **Security Warning**

The `setup.html` page provides full administrative control over the bingo board's configuration. Access is protected by Firebase Authentication, and only users with the `Admin` role can view and use this page. Ensure that the `Admin` role is assigned only to trusted individuals.

### **Import/Export Pages**

The `import_*.html` pages provide powerful tools for managing data in bulk. They are accessible from the **Board Setup** page and are restricted to `Admin` users.

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
*   **User Management**: On the `users.html` page, Admins and Event Mods can assign teams to users. Captains can assign players to their own team.
*   **Permission Management**: On the `permissions.html` page, Admins can grant or revoke Mod and Admin roles.
*   **Submission Review**: Event Mods and Admins will see a list of all submissions. You can filter them by status, click any row to open an edit modal, and update the verification status.

## Developer's Guide

This project follows a modular architecture. Here are the key conventions:

*   **Core Services (`js/core/`)**: Any logic that is shared across multiple pages and is not a UI component belongs here. Data management is further broken down by collection in `js/core/data/`.
*   **UI Components (`js/components/`)**: Reusable pieces of the user interface, like the navbar or tile renderer.
*   **Page Controllers (`js/pages/`)**: Each `.html` file has a corresponding controller in this directory. The controller is responsible for all logic unique to that page, such as initializing components and attaching event listeners.

### Adding a New Page

1.  Create your new `mypage.html` file in the root directory.
2.  Create a corresponding `js/pages/mypageController.js` file.
3.  In `mypage.html`, add `<app-navbar></app-navbar>` for the navigation and include your controller script at the end of the body: `<script type="module" src="/js/pages/mypageController.js"></script>`.
4.  In `mypageController.js`, the first line should be `import '../components/Navbar.js';` to register the navbar component. Then, import any other core services or components you need and write your page-specific logic.

## Note on AI Generation

This project was created collaboratively with Google's Gemini. While the logic and functionality have been guided and tested by a human developer, much of the boilerplate code and documentation was AI-generated.

## License

This project is licensed under the MIT License.
