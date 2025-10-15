## Main Features:
1. Have websocket functionality so two users can play together on seperate devices.
2. Have functionality to play against the computer. 
3. Use front-end server storage to save a game and continue it later.
4. 

## Design
1. Retro 1980's pixel art and animations, think like Super Nintendo
2. Sound effects, explosions for hitting a player's piece, shots fired, missed shot
3. The game will take place on land, not at sea like Battleship. 
4. Text and screens will be reminiscent of 1980's glowing LED displays

## Screen flows: 

### Home
1. Home screen with game logo
2. Field to enter your name
3. Two buttons: [New Game] or [Continue Game]
4. [New Game]: popup appears, with the option to select [1 player] or [2 player]
    * [1 player] select computer difficulty (low, medium, hard)
    * [2 player] List connected players by name (entered from name field above)
5. Go to game screen

### Game screen
1.  Both players will set up their pieces.
    * There will be 5 pieces they can place on the board.
    * They can choose from the following: Main Battle Tank , Light Recon Vehicle, Self-Propelled Howitzer, Attack Helicopter , Fighter Jet, Stealth Bomber, Armored Personnel Carrier , Drone , Missile Launcher Truck, Amphibious Assault Vehicle , Tank Destroyer, Anti-Aircraft Gun , Scout Drone , Gunship, Heavy Transport Helicopter , AA Missile Platform , Mobile Radar Unit 
    * Each unit will take up 1 to 5 coordinate squares depending on it's size. For instance, a small unit like a radar array might only take up one coordinate (Example: G-3). A large vehicle like a stealth bomber might take up 5 coordinate spits (Example: A-6 through E-6)
    * Players can choose to choose their pieces and place them on the board manually, or be given an option to have the game randomly select vehicles and positions.
    * Once both players have set up their pieces and clicked a "Ready!" button, the game will commence
2. Each player will be asked to roll a 20-sided die (with animation) to determine who goes first. Whoever gets a higher number makes the first move. 
3. The game screen will be made up of a large frame with an overhead view of a randomly generated topographic map, (called the battlefield) similiar to this https://i.redd.it/wvfeqt3rei9a1.jpg. The map will be divided into faint grid, 9 across (1-9) by 9 down (A-I). Each player will only be able to view their own battlefield, and will not know where the other player's pieces are located. 
4. There will be a small frame in the corner (called a attack map) showing previous shots taken by the player. Each player can only view their own shots on the shot map.
5. There will be a save button which will store the game state to the server.


### Gameplay
1. Each player will take alternating turns. For the sake of this discussion, we will refer to the first player to go as Player 1 and the second player to go as Player 2. A turn operates like this:
2. Player 1 takes a turn. They will be able to click a grid square on the attack map in the corner to select which coordinate they want to attack.
3. On the attack map, There will be a disabled button that says "Fire!". When they select a square, the button will be enabled, and they can click it to attack.
4.  When Player 1 attacks, the following will happen:
    * First check to see if that coordinate is occupied in whole or in part by a vehicle on Player 2's battlefield. 
    * If it is occupied, an explosion animation will happen at the appropriate coordinate on Player 2's battlefield. The coordinate will be marked in the center with a small explosion icon. On both player's screens, stylized words will appear in the center saying "Direct hit!". On Player 1's attack map, the coordinate will also be marked with a small explosion icon. 
    * If the coordinate is not occupied, then nothing will happen on Player 2's battlefield. On player 1's attack map, the coordinate will be marked with a small white dot. On both player's screen, stylized text will appear that reads "Attack unsuccessful!"
5. After Player 1's takes a turn, it will be Player 2's turn. At the start of each player's turn, stylized words will appear on their screen that say "Your turn!"
6. Once a player hits a coordinate, they cannot select that coordinate to attack on any subsequent turns.
7. If a player's vehicle has been hit on all the coordinates it occupies, a message will appear on both player's screen, saying something like "Your {vehicle name} has been destroyed! / You destroyed Player 2's {vehicle name}!" That vehicle will be destroyed, and those coordinates cannot be attacked by the opposing player. 
8. Whichever player successfully destroys their opponent's vehicles first is the winner. 
9. After gameplay is over, a popup will appear asking if they want to play a game again, or go back to the main screen.