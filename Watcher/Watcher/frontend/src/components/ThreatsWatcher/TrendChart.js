import React, { useEffect } from "react";
import PropTypes from 'prop-types';

const TrendChart = ({ word, postUrls }) => {
  useEffect(() => {
    if (!window.google) {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/charts/loader.js';
      script.async = true;
      script.onload = () => initChart();
      document.head.appendChild(script);
    } else {
      initChart();
    }
  }, [word, postUrls]);

  const initChart = () => {
    window.google.charts.load("current", { packages: ["corechart"] });
    window.google.charts.setOnLoadCallback(drawChart);
  };

  const drawChart = () => {
    if (!word || !postUrls?.length) return;

    // Formater et grouper les données
    const groupedData = postUrls.reduce((acc, element) => {
      const date = new Date(element.split(",", 2)[1].split(" ", 2)[0]);
      const dateKey = date.toISOString().split("T")[0];
      acc[dateKey] = (acc[dateKey] || 0) + 1;
      return acc;
    }, {});

    // Créer le tableau de données
    const dataTable = [
      ["Date", "Posts"],
      ...Object.entries(groupedData).map(([date, count]) => [new Date(date), count])
    ];

    const data = new window.google.visualization.DataTable();
    data.addColumn('date', 'Date');
    data.addColumn('number', 'Posts');
    data.addRows(dataTable.slice(1));

    const options = {
      title: `${word} trend`,
      titleTextStyle: { color: "#FFFFFF", fontSize: 16 },
      backgroundColor: { fill: 'transparent' },
      chartArea: { 
        width: '80%',
        height: '70%'
      },
      hAxis: {
        title: "Date",
        textStyle: { color: "#FFFFFF" },
        titleTextStyle: { color: "#FFFFFF" },
        gridlines: { color: "#444" }
      },
      vAxis: {
        title: "Posts",
        textStyle: { color: "#FFFFFF" },
        titleTextStyle: { color: "#FFFFFF" },
        gridlines: { color: "#444" },
        minValue: 0
      },
      legend: { position: "none" },
      lineWidth: 2,
      colors: ["#0288D1"],
      curveType: "function",
      pointSize: 4,
      animation: {
        startup: true,
        duration: 1000,
        easing: 'out'
      }
    };

    const chart = new window.google.visualization.LineChart(
      document.getElementById("chart_div")
    );
    chart.draw(data, options);
  };

  if (!word) return null;

  return (
    <div className="row">
      <div 
        id="chart_div" 
        style={{ 
          width: "100%", 
          height: "400px",
          borderRadius: '5px',
          overflow: 'hidden'
        }}
      />
    </div>
  );
};

TrendChart.propTypes = {
  word: PropTypes.string,
  postUrls: PropTypes.arrayOf(PropTypes.string)
};

export default TrendChart;