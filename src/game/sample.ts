import type { Game } from './game'

export const sampleGame: Game = {
  topic: 'Computer Science',
  categories: [
    {
      id: 'structures',
      title: 'Data Structures',
      questions: [
        { id: 'stack', points: 100, prompt: 'Which data structure removes the most recently added item first?', answer: 'A stack. It follows last in, first out (LIFO) order.' },
        { id: 'queue', points: 200, prompt: 'Which data structure models a line where people are served in arrival order?', answer: 'A queue. It follows first in, first out (FIFO) order.' },
        { id: 'hash', points: 300, prompt: 'Which data structure uses a hash function to map keys to storage locations?', answer: 'A hash table. It uses the hash of a key to find a bucket for its value.' },
      ],
    },
    {
      id: 'algorithms',
      title: 'Algorithms',
      questions: [
        { id: 'binary', points: 100, prompt: 'What search algorithm repeatedly halves the search range in a sorted array?', answer: 'Binary search. It compares the target with the middle element to discard half of the remaining range.' },
        { id: 'breadth', points: 200, prompt: 'Which graph traversal visits all immediate neighbors before moving farther from the start?', answer: 'Breadth-first search. It uses a queue to explore nodes one level at a time.' },
        { id: 'merge', points: 300, prompt: 'What is the worst-case time complexity of merge sort?', answer: 'O(n log n). There are logarithmically many levels, with linear merging work at each level.' },
      ],
    },
    {
      id: 'web',
      title: 'The Web',
      questions: [
        { id: 'html', points: 100, prompt: 'What language defines the structure and meaning of content on a web page?', answer: 'HTML, or HyperText Markup Language.' },
        { id: 'dns', points: 200, prompt: 'What system lets a browser look up an IP address for a domain name?', answer: 'DNS, the Domain Name System. It can resolve a hostname to an IP address.' },
        { id: 'status', points: 300, prompt: 'Which HTTP status code indicates that a request succeeded and created a resource?', answer: '201 Created. It indicates that the server created one or more resources in response to the request.' },
      ],
    },
    {
      id: 'databases',
      title: 'Databases',
      questions: [
        { id: 'sql', points: 100, prompt: 'What language is commonly used to query data in a relational database?', answer: 'SQL, or Structured Query Language.' },
        { id: 'primary-key', points: 200, prompt: 'What kind of key uniquely identifies each row in a relational table?', answer: 'A primary key. It can use one column or a combination of columns.' },
        { id: 'atomicity', points: 300, prompt: 'Which transaction property ensures that a bank transfer either debits and credits both accounts or applies neither change?', answer: 'Atomicity. It makes the operations in a transaction succeed or fail as a unit.' },
      ],
    },
  ],
}
