# MeanMessenger

MeanMessenger is a live chatting web application built using the MEAN stack (MongoDB, Express.js, Angular, and Node.js). It allows users to communicate in real-time with a seamless and responsive interface.

## Features

- **Real-time Messaging**: Instant communication using WebSocket technology.
- **User Authentication**: Secure login and registration system.
- **Responsive Design**: Optimized for both desktop and mobile devices.
- **Chat Rooms**: Create and join multiple chat rooms.
- **Message History**: Persistent storage of chat messages.

## Technologies Used

- **Frontend**: Angular
- **Backend**: Node.js with Express.js
- **Database**: MongoDB
- **Real-time Communication**: Socket.IO

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/yourusername/MeanMessenger.git
    cd MeanMessenger
    ```

2. Install dependencies:
    ```bash
    npm install
    cd client
    npm install
    cd ..
    ```

3. Configure environment variables:
    - Create a `.env` file in the root directory.
    - Add the following variables:
      ```
      MONGO_URI=your_mongodb_connection_string
      JWT_SECRET=your_jwt_secret
      ```

4. Start the application:
    ```bash
    npm run dev
    ```

5. Open your browser and navigate to `http://localhost:4200`.

## Usage

1. Register a new account or log in with an existing one.
2. Create or join a chat room.
3. Start chatting in real-time!

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch:
    ```bash
    git checkout -b feature-name
    ```
3. Commit your changes:
    ```bash
    git commit -m "Add feature-name"
    ```
4. Push to the branch:
    ```bash
    git push origin feature-name
    ```
5. Open a pull request.

## License

This project is licensed under the [MIT License](LICENSE).

## Contact

For any questions or feedback, feel free to reach out at your.email@example.com.