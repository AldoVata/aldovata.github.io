const DATA_PATH = "data/var_attendance.csv";

const chartLayoutBase = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: {
    color: "#e5e7eb",
    family: "Arial"
  },
  xaxis: {
    gridcolor: "#334155"
  },
  yaxis: {
    gridcolor: "#334155"
  },
  margin: {
    t: 55,
    r: 30,
    b: 70,
    l: 70
  }
};

const chartConfig = {
  responsive: true,
  displayModeBar: false
};

function numberValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const cleaned = String(value).replace(/,/g, "").trim();
  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function getColumn(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined) {
      return row[name];
    }
  }

  return null;
}

function normalizeRow(row) {
  const seasonStart = numberValue(
    getColumn(row, ["Season Start", "SeasonStart", "season_start"])
  );

  const attendance = numberValue(
    getColumn(row, ["Average Attendance", "AverageAttendance", "attendance"])
  );

  const divisionRaw = getColumn(row, ["Division", "division", "League", "league"]);
  const divisionText = String(divisionRaw || "").toLowerCase();

  let group = "Control";

  if (
    divisionRaw === 1 ||
    divisionRaw === "1" ||
    divisionText.includes("premier") ||
    divisionText.includes("prem")
  ) {
    group = "Treated";
  }

  return {
    season: getColumn(row, ["Season", "season"]),
    seasonStart: seasonStart,
    team: getColumn(row, ["Team Name", "TeamName", "team"]),
    position: numberValue(getColumn(row, ["Position", "position"])),
    goals: numberValue(getColumn(row, ["Goals Scored", "GoalsScored", "goals"])),
    points: numberValue(getColumn(row, ["Points", "points"])),
    yellowCards: numberValue(getColumn(row, ["Yellow Cards", "YellowCards"])),
    redCards: numberValue(getColumn(row, ["Red Cards", "RedCards"])),
    foulsConceded: numberValue(getColumn(row, ["Fouls Conceded Per 90", "FoulsConcededPer90"])),
    foulsReceived: numberValue(getColumn(row, ["Fouls Recieved Per 90", "Fouls Received Per 90", "FoulsReceivedPer90"])),
    offsides: numberValue(getColumn(row, ["Offsides Per 90", "OffsidesPer90"])),
    attendance: attendance,
    group: group,
    postVAR: seasonStart >= 2019 ? "After VAR" : "Before VAR"
  };
}

function average(values) {
  const validValues = values.filter(value => value !== null && Number.isFinite(value));

  if (validValues.length === 0) {
    return null;
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function groupAverage(rows, groupField, valueField) {
  const groups = {};

  rows.forEach(row => {
    const groupName = row[groupField];
    const value = row[valueField];

    if (groupName === null || groupName === undefined || value === null) {
      return;
    }

    if (!groups[groupName]) {
      groups[groupName] = [];
    }

    groups[groupName].push(value);
  });

  return Object.entries(groups).map(([groupName, values]) => ({
    group: groupName,
    value: average(values)
  }));
}

function groupAverageBySeason(rows, valueField, groupName) {
  const filtered = rows.filter(row => row.group === groupName);
  const seasonGroups = {};

  filtered.forEach(row => {
    if (row.seasonStart === null || row[valueField] === null) {
      return;
    }

    if (!seasonGroups[row.seasonStart]) {
      seasonGroups[row.seasonStart] = [];
    }

    seasonGroups[row.seasonStart].push(row[valueField]);
  });

  return Object.entries(seasonGroups)
    .map(([season, values]) => ({
      season: Number(season),
      value: average(values)
    }))
    .sort((a, b) => a.season - b.season);
}

function updateStatCards(rows) {
  const seasons = rows
    .map(row => row.seasonStart)
    .filter(value => value !== null)
    .sort((a, b) => a - b);

  document.getElementById("totalRows").textContent = rows.length;

  if (seasons.length > 0) {
    document.getElementById("seasonRange").textContent =
      `${seasons[0]}–${seasons[seasons.length - 1]}`;
  }
}

function makeAttendanceTrend(rows) {
  const treated = groupAverageBySeason(rows, "attendance", "Treated");
  const control = groupAverageBySeason(rows, "attendance", "Control");

  const traces = [
    {
      x: treated.map(row => row.season),
      y: treated.map(row => row.value),
      mode: "lines+markers",
      name: "Premier League / Treated",
      hovertemplate: "Season: %{x}<br>Avg Attendance: %{y:,.0f}<extra></extra>"
    },
    {
      x: control.map(row => row.season),
      y: control.map(row => row.value),
      mode: "lines+markers",
      name: "Championship / Control",
      hovertemplate: "Season: %{x}<br>Avg Attendance: %{y:,.0f}<extra></extra>"
    }
  ];

  const layout = {
    ...chartLayoutBase,
    title: "Average Attendance Over Time",
    xaxis: {
      ...chartLayoutBase.xaxis,
      title: "Season Start"
    },
    yaxis: {
      ...chartLayoutBase.yaxis,
      title: "Average Attendance"
    },
    shapes: [
      {
        type: "line",
        x0: 2019,
        x1: 2019,
        y0: 0,
        y1: 1,
        xref: "x",
        yref: "paper",
        line: {
          color: "#f87171",
          width: 2,
          dash: "dash"
        }
      }
    ],
    annotations: [
      {
        x: 2019,
        y: 1,
        xref: "x",
        yref: "paper",
        text: "VAR Introduced",
        showarrow: false,
        font: {
          color: "#f87171"
        },
        yshift: 15
      }
    ]
  };

  Plotly.newPlot("attendanceTrend", traces, layout, chartConfig);
}

function makeBeforeAfterChart(rows) {
  // Excluding zero-attendance rows helps prevent COVID-restriction seasons from dominating this comparison.
  const validRows = rows.filter(row => row.attendance !== null && row.attendance > 0);

  const treatedBefore = average(
    validRows
      .filter(row => row.group === "Treated" && row.postVAR === "Before VAR")
      .map(row => row.attendance)
  );

  const treatedAfter = average(
    validRows
      .filter(row => row.group === "Treated" && row.postVAR === "After VAR")
      .map(row => row.attendance)
  );

  const controlBefore = average(
    validRows
      .filter(row => row.group === "Control" && row.postVAR === "Before VAR")
      .map(row => row.attendance)
  );

  const controlAfter = average(
    validRows
      .filter(row => row.group === "Control" && row.postVAR === "After VAR")
      .map(row => row.attendance)
  );

  const traces = [
    {
      x: ["Before VAR", "After VAR"],
      y: [treatedBefore, treatedAfter],
      type: "bar",
      name: "Premier League / Treated",
      hovertemplate: "%{x}<br>Avg Attendance: %{y:,.0f}<extra></extra>"
    },
    {
      x: ["Before VAR", "After VAR"],
      y: [controlBefore, controlAfter],
      type: "bar",
      name: "Championship / Control",
      hovertemplate: "%{x}<br>Avg Attendance: %{y:,.0f}<extra></extra>"
    }
  ];

  const layout = {
    ...chartLayoutBase,
    title: "Average Attendance Before vs After VAR",
    barmode: "group",
    xaxis: {
      ...chartLayoutBase.xaxis,
      title: "Period"
    },
    yaxis: {
      ...chartLayoutBase.yaxis,
      title: "Average Attendance"
    }
  };

  Plotly.newPlot("beforeAfterChart", traces, layout, chartConfig);
}

function makeRegressionChart() {
  const variables = [
    "VAR DiD Effect",
    "Points",
    "Offsides Per 90",
    "Red Cards",
    "Fouls Received Per 90",
    "Fouls Conceded Per 90"
  ];

  const coefficients = [
    -1233.289,
    146.735,
    1303.921,
    818.621,
    561.914,
    -478.734
  ];

  const pValues = [
    0.159,
    0.086,
    0.007,
    0.402,
    0.616,
    0.686
  ];

  const trace = {
    x: coefficients,
    y: variables,
    type: "bar",
    orientation: "h",
    text: pValues.map(value => `p = ${value}`),
    hovertemplate: "Variable: %{y}<br>Coefficient: %{x:,.2f}<br>%{text}<extra></extra>"
  };

  const layout = {
    ...chartLayoutBase,
    title: "Selected Regression Coefficients",
    xaxis: {
      ...chartLayoutBase.xaxis,
      title: "Coefficient"
    },
    yaxis: {
      ...chartLayoutBase.yaxis,
      automargin: true
    },
    shapes: [
      {
        type: "line",
        x0: 0,
        x1: 0,
        y0: -0.5,
        y1: variables.length - 0.5,
        line: {
          color: "#e5e7eb",
          width: 1
        }
      }
    ]
  };

  Plotly.newPlot("regressionChart", [trace], layout, chartConfig);
}

function makeScatterChart(rows) {
  const validRows = rows.filter(row =>
    row.points !== null &&
    row.attendance !== null &&
    row.attendance > 0
  );

  const treated = validRows.filter(row => row.group === "Treated");
  const control = validRows.filter(row => row.group === "Control");

  const traces = [
    {
      x: treated.map(row => row.points),
      y: treated.map(row => row.attendance),
      text: treated.map(row => `${row.team || "Team"} (${row.seasonStart})`),
      mode: "markers",
      type: "scatter",
      name: "Premier League / Treated",
      hovertemplate: "%{text}<br>Points: %{x}<br>Attendance: %{y:,.0f}<extra></extra>"
    },
    {
      x: control.map(row => row.points),
      y: control.map(row => row.attendance),
      text: control.map(row => `${row.team || "Team"} (${row.seasonStart})`),
      mode: "markers",
      type: "scatter",
      name: "Championship / Control",
      hovertemplate: "%{text}<br>Points: %{x}<br>Attendance: %{y:,.0f}<extra></extra>"
    }
  ];

  const layout = {
    ...chartLayoutBase,
    title: "Average Attendance vs Points",
    xaxis: {
      ...chartLayoutBase.xaxis,
      title: "Points"
    },
    yaxis: {
      ...chartLayoutBase.yaxis,
      title: "Average Attendance"
    }
  };

  Plotly.newPlot("scatterChart", traces, layout, chartConfig);
}

function makeOffsidesTrend(rows) {
  const treated = groupAverageBySeason(rows, "offsides", "Treated");
  const control = groupAverageBySeason(rows, "offsides", "Control");

  const traces = [
    {
      x: treated.map(row => row.season),
      y: treated.map(row => row.value),
      mode: "lines+markers",
      name: "Premier League / Treated",
      hovertemplate: "Season: %{x}<br>Offsides Per 90: %{y:.2f}<extra></extra>"
    },
    {
      x: control.map(row => row.season),
      y: control.map(row => row.value),
      mode: "lines+markers",
      name: "Championship / Control",
      hovertemplate: "Season: %{x}<br>Offsides Per 90: %{y:.2f}<extra></extra>"
    }
  ];

  const layout = {
    ...chartLayoutBase,
    title: "Offsides Per 90 Over Time",
    xaxis: {
      ...chartLayoutBase.xaxis,
      title: "Season Start"
    },
    yaxis: {
      ...chartLayoutBase.yaxis,
      title: "Offsides Per 90"
    },
    shapes: [
      {
        type: "line",
        x0: 2019,
        x1: 2019,
        y0: 0,
        y1: 1,
        xref: "x",
        yref: "paper",
        line: {
          color: "#f87171",
          width: 2,
          dash: "dash"
        }
      }
    ],
    annotations: [
      {
        x: 2019,
        y: 1,
        xref: "x",
        yref: "paper",
        text: "VAR Introduced",
        showarrow: false,
        font: {
          color: "#f87171"
        },
        yshift: 15
      }
    ]
  };

  Plotly.newPlot("offsidesTrend", traces, layout, chartConfig);
}

function showError(message) {
  const chartIds = [
    "attendanceTrend",
    "beforeAfterChart",
    "regressionChart",
    "scatterChart",
    "offsidesTrend"
  ];

  chartIds.forEach(id => {
    const element = document.getElementById(id);

    if (element) {
      element.innerHTML = `
        <div style="padding: 24px; color: #f87171;">
          ${message}
        </div>
      `;
    }
  });
}

fetch(DATA_PATH)
  .then(response => {
    if (!response.ok) {
      throw new Error("CSV file not found.");
    }

    return response.text();
  })
  .then(csvText => {
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });

    const rows = parsed.data
      .map(normalizeRow)
      .filter(row => row.seasonStart !== null);

    updateStatCards(rows);
    makeAttendanceTrend(rows);
    makeBeforeAfterChart(rows);
    makeRegressionChart();
    makeScatterChart(rows);
    makeOffsidesTrend(rows);
  })
  .catch(error => {
    console.error(error);

    makeRegressionChart();

    showError(
      "Could not load data/var_attendance.csv. Make sure your CSV file is inside projects/var-attendance/data/ and named var_attendance.csv."
    );
  });
