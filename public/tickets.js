(function ticketModule(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TambolaTickets = factory();
  }
})(typeof self !== "undefined" ? self : this, function buildTicketApi() {
  const COLUMN_RANGES = [
    [1, 9],
    [10, 19],
    [20, 29],
    [30, 39],
    [40, 49],
    [50, 59],
    [60, 69],
    [70, 79],
    [80, 90]
  ];

  function shuffle(values) {
    const copy = values.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function range(start, end) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  function pickColumnCounts() {
    const counts = Array(9).fill(1);
    let remaining = 6;

    while (remaining > 0) {
      const column = Math.floor(Math.random() * 9);
      if (counts[column] < 3) {
        counts[column] += 1;
        remaining -= 1;
      }
    }

    return counts;
  }

  function makeRowLayout(counts) {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const rows = [[], [], []];
      const rowCounts = [0, 0, 0];
      let valid = true;

      counts.forEach((count, column) => {
        const preferredRows = shuffle([0, 1, 2]).sort((a, b) => rowCounts[a] - rowCounts[b]);
        const chosenRows = [];

        preferredRows.forEach((row) => {
          if (chosenRows.length < count && rowCounts[row] < 5) {
            chosenRows.push(row);
            rowCounts[row] += 1;
            rows[row].push(column);
          }
        });

        if (chosenRows.length !== count) {
          valid = false;
        }
      });

      if (valid && rowCounts.every((total) => total === 5)) {
        return rows;
      }
    }

    throw new Error("Could not generate a valid Tambola row layout.");
  }

  function generateTicket() {
    const counts = pickColumnCounts();
    const rowLayout = makeRowLayout(counts);
    const grid = Array.from({ length: 3 }, () => Array(9).fill(null));

    counts.forEach((count, column) => {
      const [start, end] = COLUMN_RANGES[column];
      const numbers = shuffle(range(start, end)).slice(0, count).sort((a, b) => a - b);
      const rowsForColumn = rowLayout
        .map((columns, rowIndex) => (columns.includes(column) ? rowIndex : null))
        .filter((rowIndex) => rowIndex !== null)
        .sort((a, b) => a - b);

      rowsForColumn.forEach((rowIndex, index) => {
        grid[rowIndex][column] = numbers[index];
      });
    });

    return {
      id: cryptoId(),
      grid
    };
  }

  function generateTickets(count) {
    return Array.from({ length: count }, generateTicket);
  }

  function getTicketNumbers(ticket) {
    return ticket.grid.flat().filter((number) => Number.isInteger(number));
  }

  function cryptoId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return "ticket-" + Math.random().toString(36).slice(2, 11);
  }

  return {
    COLUMN_RANGES,
    generateTicket,
    generateTickets,
    getTicketNumbers
  };
});
