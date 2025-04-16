/**
 * Servicio para generar gráficas a partir de datos de consultas SQL
 * Usando Chart.js con QuickChart API para compatibilidad con Windows
 * Evita dependencias nativas como canvas que causan problemas en Windows
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const queryService = require('../controllers/flujos/consultas/querysService');

class ChartService {
    constructor() {
        // Asegurar que existe el directorio para guardar las gráficas
        this.chartsDir = path.join(process.cwd(), 'tmp', 'charts');
        if (!fs.existsSync(this.chartsDir)) {
            fs.mkdirSync(this.chartsDir, { recursive: true });
        }
        
        // URL base para acceder a las imágenes
        this.baseUrl = '/var/www/html/';
        
        // URL base de QuickChart API
        this.quickChartUrl = 'https://quickchart.io/chart';
        
        // Dimensiones de las gráficas
        this.width = 800;
        this.height = 600;
    }


    /**
     * Genera una gráfica de barras a partir de datos
     * @param {Array} data - Datos para la gráfica
     * @param {string} title - Título de la gráfica
     * @param {string} xLabel - Etiqueta del eje X
     * @param {string} yLabel - Etiqueta del eje Y
     * @returns {Promise<string>} - URL de la imagen generada
     */
    async generateBarChart(data, title, xLabel, yLabel) {
 
        const labels = data.map(item => item.label);
        const values = data.map(item => item.value);
        
        // Generar colores para las barras
        const colors = labels.map((_, i) => `hsl(${(i * 360 / labels.length) % 360}, 70%, 60%)`);

        const configuration = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: yLabel,
                    data: values,
                    backgroundColor: colors,
                    borderColor: colors.map(color => color.replace('60%', '50%')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        font: {
                            size: 24
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: xLabel
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: yLabel
                        },
                        beginAtZero: true
                    }
                }
            },
            width: this.width,
            height: this.height,
            backgroundColor: 'white'
        };
        

        const response = await axios.post(this.quickChartUrl, {
            chart: configuration
        }, {
            responseType: 'arraybuffer'
        });
        

        const fileName = `chart-${Date.now()}.png`;
        const filePath = path.join(this.chartsDir, fileName);
        fs.writeFileSync(filePath, response.data);

        return this.copyToWebDir(filePath, fileName);
    }
    


    async generatePieChart(data, title) {

        const labels = data.map(item => item.label);
        const values = data.map(item => item.value);
        
 
        const colors = labels.map((_, i) => `hsl(${(i * 360 / labels.length) % 360}, 70%, 60%)`);
        
        // Configuración de la gráfica
        const configuration = {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderColor: colors.map(color => color.replace('60%', '50%')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        font: {
                            size: 24
                        }
                    },
                    legend: {
                        position: 'right',
                        labels: {
                            generateLabels: function(chart) {
                                const data = chart.data;
                                if (data.labels.length && data.datasets.length) {
                                    const dataset = data.datasets[0];
                                    const total = dataset.data.reduce((sum, value) => sum + value, 0);
                                    
                                    return data.labels.map((label, i) => {
                                        const value = dataset.data[i];
                                        const percentage = ((value / total) * 100).toFixed(1) + '%';
                                        return {
                                            text: `${label} (${value}) - ${percentage}`,
                                            fillStyle: dataset.backgroundColor[i],
                                            hidden: false,
                                            index: i
                                        };
                                    });
                                }
                                return [];
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((sum, value) => sum + value, 0);
                                const value = context.raw;
                                const percentage = ((value / total) * 100).toFixed(1) + '%';
                                return `${context.label}: ${value} (${percentage})`;
                            }
                        }
                    }
                }
            },
            width: this.width,
            height: this.height,
            backgroundColor: 'white'
        };
        
        // Usar QuickChart API para generar la gráfica
        const response = await axios.post(this.quickChartUrl, {
            chart: configuration
        }, {
            responseType: 'arraybuffer'
        });
        
        // Guardar imagen
        const fileName = `pie-chart-${Date.now()}.png`;
        const filePath = path.join(this.chartsDir, fileName);
        fs.writeFileSync(filePath, response.data);
        
        // Copiar al directorio web y devolver URL
        return this.copyToWebDir(filePath, fileName);
    }
    

    async copyToWebDir(filePath, fileName) {
        return new Promise((resolve, reject) => {
            try {
                // Obtener el puerto de la aplicación desde config.js
                const { puertoInit } = require('../../config.js');
                
                if (process.platform === 'win32') {
                    console.log(`Imagen generada en: ${filePath}`);
                    // En Windows, devolvemos una URL con formato http para compatibilidad
                    // Usamos localhost con el puerto correcto y el endpoint chart-image
                    resolve(`http://localhost:${puertoInit}/chart-image/${fileName}`);
                    return;
                }
            } catch (error) {
                console.error(`Error en copyToWebDir: ${error.message}`);
                reject(error);
            }
        });
    }
    
    

    async generateChartFromQuery(query, chartType, title, xLabel = '', yLabel = '') {
        try {

            const sqlQuery = await queryService.generateSqlQuery(query);
            const queryResult = await queryService.executeQuery(sqlQuery);
            
            if (!queryResult.success || queryResult.results.length === 0) {
                throw new Error('No se encontraron resultados para la consulta');
            }
            
      
            const data = this.prepareDataForChart(queryResult.results);
            
            
            if (chartType === 'pie') {
                return await this.generatePieChart(data, title);
            } else {
                return await this.generateBarChart(data, title, xLabel, yLabel);
            }
        } catch (error) {
            console.error(`Error al generar gráfica: ${error.message}`);
            throw error;
        }
    }
    

    prepareDataForChart(results) {

        if (results.length === 1) {
            const row = results[0];
            return Object.entries(row)
                .filter(([key, value]) => typeof value === 'number')
                .map(([key, value]) => ({
                    label: key,
                    value: value
                }));
        }
        

        const keys = Object.keys(results[0]);

        const numericColumns = [];
        const textColumns = [];
        
        for (const key of keys) {
            if (typeof results[0][key] === 'number') {
                numericColumns.push(key);
            } else {
                textColumns.push(key);
            }
        }

        if (textColumns.length > 0 && numericColumns.length > 0) {
            const labelColumn = textColumns[0];
            const valueColumn = numericColumns[0];
            
            return results.map(row => ({
                label: String(row[labelColumn]),
                value: Number(row[valueColumn])
            }));
        }
        

        return results.map(row => ({
            label: String(row[keys[0]]),
            value: Number(row[keys[1] || keys[0]])
        }));
    }
}


const chartService = new ChartService();
module.exports = chartService;