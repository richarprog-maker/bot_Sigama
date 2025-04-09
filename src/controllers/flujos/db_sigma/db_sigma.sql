-- Creación de la base de datos
CREATE DATABASE IF NOT EXISTS db_sigmav2;
USE db_sigmav2;

-- Tabla para consultas_repuestos.json
CREATE TABLE IF NOT EXISTS consultas_repuestos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    local VARCHAR(50),
    cod_repuesto VARCHAR(50),
    repuesto VARCHAR(255),
    ubicacion VARCHAR(100),
    stock VARCHAR(20),
    ultimo_ingreso VARCHAR(50),
    ultimo_egreso VARCHAR(50),
    marca VARCHAR(100),
    categoria VARCHAR(100),
    precio_dolar DECIMAL(10, 4),
    precio_sol DECIMAL(10, 4)
);

-- Tabla para meson.json
CREATE TABLE IF NOT EXISTS meson (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sede VARCHAR(100),
    nota_venta VARCHAR(50),
    mayoreo VARCHAR(10),
    asesor VARCHAR(100),
    fecha_apertura VARCHAR(50),
    fecha_facturacion VARCHAR(50),
    documento VARCHAR(50),
    cliente VARCHAR(255),
    tc DECIMAL(10, 3),
    moneda VARCHAR(20),
    precio_total_factura VARCHAR(50),
    factura_meson VARCHAR(50),
    marca VARCHAR(100),
    codigo VARCHAR(50),
    descripcion VARCHAR(255),
    cantidad VARCHAR(20),
    precio_soles DECIMAL(10, 2),
    costo_soles DECIMAL(10, 2),
    margen_soles DECIMAL(10, 2),
    precio_dolares DECIMAL(10, 2),
    costo_dolares DECIMAL(10, 2),
    margen_dolares DECIMAL(10, 2)
);

-- Tabla para ots_facturdas.json
CREATE TABLE IF NOT EXISTS ots_facturadas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    area VARCHAR(50),
    sede VARCHAR(100),
    num_ot VARCHAR(50),
    estado_ot VARCHAR(50),
    seguro VARCHAR(50),
    asesor VARCHAR(100),
    fecha_apertura VARCHAR(50),
    fecha_facturacion VARCHAR(50),
    tipo_ot VARCHAR(50),
    kilometraje_ot VARCHAR(50),
    placa VARCHAR(20),
    vin VARCHAR(100),
    marca VARCHAR(100),
    modelo_tecnico VARCHAR(255),
    color VARCHAR(50),
    anio_fabricacion VARCHAR(20),
    anio_modelo VARCHAR(20),
    tipo_doc VARCHAR(20),
    documento VARCHAR(50),
    cliente VARCHAR(255),
    tc_venta DECIMAL(10, 3),
    moneda VARCHAR(20),
    precio_total_factura VARCHAR(50),
    factura_ot VARCHAR(50),
    tipo VARCHAR(100),
    codigo VARCHAR(50),
    descripcion VARCHAR(255),
    cant_facturada VARCHAR(20),
    precio_soles DECIMAL(10, 2),
    costo_soles DECIMAL(10, 2),
    margen_soles DECIMAL(10, 2),
    precio_dolares DECIMAL(10, 2),
    costo_dolares DECIMAL(10, 2),
    margen_dolares DECIMAL(10, 2)
);

-- Tabla para sacumuladas_ots.json
CREATE TABLE IF NOT EXISTS acumuladas_ots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    area VARCHAR(50),
    sede VARCHAR(100),
    num_ot VARCHAR(50),
    estado_ot VARCHAR(50),
    seguro VARCHAR(50),
    asesor VARCHAR(100),
    fecha_apertura VARCHAR(50),
    fecha_facturacion VARCHAR(50),
    tipo_ot VARCHAR(50),
    kilometraje_ot VARCHAR(50),
    placa VARCHAR(20),
    vin VARCHAR(100),
    marca VARCHAR(100),
    modelo_tecnico VARCHAR(255),
    color VARCHAR(50),
    anio_fabricacion VARCHAR(20),
    anio_modelo VARCHAR(20),
    tipo_doc VARCHAR(20),
    documento VARCHAR(50),
    cliente VARCHAR(255),
    tc_venta DECIMAL(10, 3),
    moneda VARCHAR(20),
    precio_total_factura VARCHAR(50),
    factura_ot VARCHAR(50)
);