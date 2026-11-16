# Rubik's Cube 3D

An interactive, mobile-friendly 3D Rubik's Cube game built with **Next.js**, **React Three Fiber**, and **Three.js**.

## Features

- **Intuitive 3D Controls:** Swipe or drag directly on any face of the cube to twist that layer, or drag outside the cube to orbit the camera freely.
- **Keyboard Support:** Use standard Singmaster notation keys (`U`, `D`, `L`, `R`, `F`, `B`) for clockwise turns and `Shift + Key` for counter-clockwise (`'`) turns.
- **Game Loop & Speedrun Timer:**
  - **Scramble:** Generates a 20-move random scramble without redundant consecutive axis moves.
  - **Auto-Timer & Move Counter:** Starts automatically on your first move and stops the moment the cube is solved.
  - **Undo & Reset:** Step backward through your moves or cleanly reset the cube to its solved state.
- **Mobile-First Design:** Screen-space gesture projection and `touch-action` locking ensure smooth gameplay on phones and tablets without accidental page scrolling.
- **Studio Lighting & Reflections:** Dynamic environment lighting, soft contact shadows, and subtle particle ambiance.

## Tech Stack

- [Next.js](https://nextjs.org/) (App Router)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) & [Drei](https://github.com/pmndrs/drei)
- [Three.js](https://threejs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- TypeScript