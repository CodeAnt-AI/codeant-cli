import React, { useState, useEffect } from 'react';
import { Text, Box, useApp } from 'ink';

const logo = `
   ___          _        _          _
  / __\\___   __| | ___  / \\   _ __ | |_
 / /  / _ \\ / _\` |/ _ \\/  /\\ | '_ \\| __|
/ /__| (_) | (_| |  __/\\_/ \\ | | | | |_
\\____/\\___/ \\__,_|\\___\\___/\\_/_| |_|\\__|
`;

const tagline = "Your AI-powered code review companion";

const commands = [
  { cmd: 'codeant review', desc: 'Run AI-powered code review' },
  { cmd: 'codeant secrets', desc: 'Scan for secrets in your code' },
  { cmd: 'codeant login', desc: 'Login to CodeAnt' },
  { cmd: 'codeant --help', desc: 'Show all commands' },
];

export default function Welcome({ version }) {
  const { exit } = useApp();
  const [displayedLogo, setDisplayedLogo] = useState('');
  const [displayedTagline, setDisplayedTagline] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const [phase, setPhase] = useState('logo');
  const [showCommands, setShowCommands] = useState(false);

  // Typing effect for logo (fast)
  useEffect(() => {
    if (phase !== 'logo') return;

    let i = 0;
    const chars = logo.split('');
    const interval = setInterval(() => {
      if (i < chars.length) {
        setDisplayedLogo(prev => prev + chars[i]);
        i++;
      } else {
        clearInterval(interval);
        setPhase('tagline');
      }
    }, 2);

    return () => clearInterval(interval);
  }, [phase]);

  // Typing effect for tagline (slower, more dramatic)
  useEffect(() => {
    if (phase !== 'tagline') return;

    let i = 0;
    const chars = tagline.split('');
    const interval = setInterval(() => {
      if (i < chars.length) {
        setDisplayedTagline(prev => prev + chars[i]);
        i++;
      } else {
        clearInterval(interval);
        setPhase('commands');
        setShowCommands(true);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [phase]);

  // Blinking cursor
  useEffect(() => {
    if (phase === 'commands') {
      setShowCursor(false);
      return;
    }
    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 400);
    return () => clearInterval(interval);
  }, [phase]);

  // Exit after animation
  useEffect(() => {
    if (showCommands) {
      const timeout = setTimeout(() => exit(), 100);
      return () => clearTimeout(timeout);
    }
  }, [showCommands, exit]);

  const cursor = showCursor ? '|' : ' ';

  const elements = [
    React.createElement(Text, { key: 'logo', color: 'cyan', bold: true }, displayedLogo)
  ];

  if (phase !== 'logo') {
    elements.push(
      React.createElement(
        Box,
        { key: 'tagline-box', marginTop: 0 },
        React.createElement(
          Text,
          { color: 'magenta', italic: true },
          displayedTagline,
          React.createElement(Text, { color: 'gray' }, cursor)
        )
      )
    );
  }

  if (showCommands) {
    elements.push(
      React.createElement(Text, { key: 'divider', color: 'gray' }, '─────────────────────────────────────────')
    );

    elements.push(
      React.createElement(
        Box,
        { key: 'commands-box', marginTop: 1, flexDirection: 'column' },
        React.createElement(Text, { color: 'yellow', bold: true }, 'Quick Start:'),
        ...commands.map((item, idx) =>
          React.createElement(
            Box,
            { key: `cmd-${idx}`, marginLeft: 2 },
            React.createElement(Text, { color: 'green' }, `$ ${item.cmd}`),
            React.createElement(Text, { color: 'gray' }, `  ${item.desc}`)
          )
        )
      )
    );

    elements.push(
      React.createElement(
        Box,
        { key: 'version-box', marginTop: 1 },
        React.createElement(Text, { color: 'gray' }, `v${version || '0.0.0'}`)
      )
    );
  }

  return React.createElement(
    Box,
    { flexDirection: 'column', padding: 1 },
    ...elements
  );
}
