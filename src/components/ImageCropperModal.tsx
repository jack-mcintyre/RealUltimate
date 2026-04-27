import * as ImageManipulator from 'expo-image-manipulator';
import React, { useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    GestureResponderEvent,
    Image,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getTypography, Layout } from '../../app/theme/DesignSystem';
import { ThemeColors, useTheme } from '../../app/theme/ThemeContext';

type CropShape = 'circle' | 'banner';

type CropTarget = {
    uri: string;
    width: number;
    height: number;
};

type Props = {
    visible: boolean;
    shape: CropShape;
    title: string;
    target: CropTarget | null;
    maxDataUrlLength?: number;
    onCancel: () => void;
    onConfirm: (dataUrl: string) => void;
    onError: (message: string) => void;
};

const OUTPUT_DIMENSIONS: Record<CropShape, { width: number; height: number }> = {
    circle: { width: 512, height: 512 },
    banner: { width: 1600, height: 600 },
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getStyles = (colors: ThemeColors) => {
    const Typography = getTypography(colors);
    return StyleSheet.create({
        modalOverlay: {
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.8)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
        },
        cropCard: {
            width: '100%',
            maxWidth: 460,
            backgroundColor: colors.surface,
            borderRadius: Layout.radiusLg,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            ...Layout.shadow,
        },
        title: { ...Typography.title, fontSize: 18, marginBottom: 8, textAlign: 'center' },
        subtitle: { ...Typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginBottom: 14 },
        cropArea: {
            width: '100%',
            minHeight: 230,
            borderRadius: Layout.radiusMd,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: '#0f172a',
            overflow: 'hidden',
            marginBottom: 12,
        },
        dimOverlay: {
            position: 'absolute',
            backgroundColor: 'rgba(0,0,0,0.5)',
        },
        frameBorder: {
            position: 'absolute',
            borderWidth: 2,
            borderColor: '#ffffff',
        },
        controlsRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 12,
        },
        zoomBtn: {
            width: 34,
            height: 34,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primaryLight,
        },
        zoomBtnText: { ...Typography.body, color: colors.primary, fontWeight: '800' },
        zoomText: { ...Typography.bodySmall, color: colors.textSecondary, minWidth: 96, textAlign: 'center' },
        footerRow: {
            flexDirection: 'row',
            gap: 10,
            marginTop: 4,
        },
        footerBtn: {
            flex: 1,
            height: 44,
            borderRadius: Layout.radiusMd,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
        },
        footerBtnPrimary: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        footerBtnText: { ...Typography.button, color: colors.textSecondary },
        footerBtnTextPrimary: { ...Typography.button, color: colors.onPrimary },
        loadingWrap: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginTop: 10,
            justifyContent: 'center',
        },
        loadingText: { ...Typography.bodySmall, color: colors.textSecondary },
    });
};

const ImageCropperModal = ({
    visible,
    shape,
    title,
    target,
    maxDataUrlLength = 1_900_000,
    onCancel,
    onConfirm,
    onError,
}: Props) => {
    const { colors } = useTheme();
    const styles = getStyles(colors);

    const [areaWidth, setAreaWidth] = useState(0);
    const [areaHeight, setAreaHeight] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [isWorking, setIsWorking] = useState(false);
    const dragStartRef = useRef({ offsetX: 0, offsetY: 0, pageX: 0, pageY: 0 });

    const frame = useMemo(() => {
        const maxW = Math.max(120, areaWidth - 24);
        if (shape === 'circle') {
            const side = Math.min(maxW, Math.max(120, areaHeight - 24));
            return { width: side, height: side, radius: side / 2 };
        }

        const width = Math.min(maxW, 360);
        const height = width * (6 / 16);
        return { width, height, radius: Layout.radiusSm };
    }, [areaHeight, areaWidth, shape]);

    const transform = useMemo(() => {
        if (!target || frame.width <= 0 || frame.height <= 0) {
            return {
                scale: 1,
                displayW: 0,
                displayH: 0,
                maxPanX: 0,
                maxPanY: 0,
                left: 0,
                top: 0,
                frameLeft: 0,
                frameTop: 0,
            };
        }

        const baseScale = Math.max(frame.width / target.width, frame.height / target.height);
        const totalScale = baseScale * zoom;
        const displayW = target.width * totalScale;
        const displayH = target.height * totalScale;
        const maxPanX = Math.max(0, (displayW - frame.width) / 2);
        const maxPanY = Math.max(0, (displayH - frame.height) / 2);

        const frameLeft = (areaWidth - frame.width) / 2;
        const frameTop = (areaHeight - frame.height) / 2;

        return {
            scale: totalScale,
            displayW,
            displayH,
            maxPanX,
            maxPanY,
            left: (areaWidth - displayW) / 2 + offsetX,
            top: (areaHeight - displayH) / 2 + offsetY,
            frameLeft,
            frameTop,
        };
    }, [areaHeight, areaWidth, frame.height, frame.width, offsetX, offsetY, target, zoom]);

    const handleDragStart = (evt: GestureResponderEvent) => {
        dragStartRef.current = {
            offsetX,
            offsetY,
            pageX: evt.nativeEvent.pageX,
            pageY: evt.nativeEvent.pageY,
        };
    };

    const handleDragMove = (evt: GestureResponderEvent) => {
        const dx = evt.nativeEvent.pageX - dragStartRef.current.pageX;
        const dy = evt.nativeEvent.pageY - dragStartRef.current.pageY;
        const nextX = dragStartRef.current.offsetX + dx;
        const nextY = dragStartRef.current.offsetY + dy;
        setOffsetX(clamp(nextX, -transform.maxPanX, transform.maxPanX));
        setOffsetY(clamp(nextY, -transform.maxPanY, transform.maxPanY));
    };

    const adjustZoom = (delta: number) => {
        const next = clamp(zoom + delta, 1, 2.5);
        setZoom(next);
    };

    const handleConfirm = async () => {
        if (!target || transform.scale <= 0 || frame.width <= 0 || frame.height <= 0) {
            onError('Image crop is not ready yet.');
            return;
        }

        try {
            setIsWorking(true);

            const cropX = ((transform.displayW - frame.width) / 2 - offsetX) / transform.scale;
            const cropY = ((transform.displayH - frame.height) / 2 - offsetY) / transform.scale;
            const cropW = frame.width / transform.scale;
            const cropH = frame.height / transform.scale;

            const originX = clamp(cropX, 0, Math.max(0, target.width - cropW));
            const originY = clamp(cropY, 0, Math.max(0, target.height - cropH));
            const width = clamp(cropW, 1, target.width);
            const height = clamp(cropH, 1, target.height);

            const outputDims = OUTPUT_DIMENSIONS[shape];
            const manipulated = await ImageManipulator.manipulateAsync(
                target.uri,
                [
                    { crop: { originX, originY, width, height } },
                    { resize: { width: outputDims.width, height: outputDims.height } },
                ],
                {
                    format: ImageManipulator.SaveFormat.JPEG,
                    compress: 0.82,
                    base64: true,
                }
            );

            if (!manipulated.base64) {
                throw new Error('Image conversion failed.');
            }

            const dataUrl = `data:image/jpeg;base64,${manipulated.base64}`;
            if (dataUrl.length > maxDataUrlLength) {
                throw new Error('Image too large. Zoom out or choose a smaller image.');
            }

            onConfirm(dataUrl);
            setZoom(1);
            setOffsetX(0);
            setOffsetY(0);
        } catch (error: any) {
            onError(error?.message || 'Could not crop image.');
        } finally {
            setIsWorking(false);
        }
    };

    return (
        <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
            <View style={styles.modalOverlay}>
                <View style={styles.cropCard}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>Drag to position. Use zoom to fine tune the crop.</Text>

                    <View
                        style={styles.cropArea}
                        onLayout={(evt) => {
                            const { width, height } = evt.nativeEvent.layout;
                            setAreaWidth(width);
                            setAreaHeight(height);
                        }}
                        onStartShouldSetResponder={() => true}
                        onMoveShouldSetResponder={() => true}
                        onResponderGrant={handleDragStart}
                        onResponderMove={handleDragMove}
                    >
                        {!!target && (
                            <Image
                                source={{ uri: target.uri }}
                                style={{
                                    position: 'absolute',
                                    width: transform.displayW,
                                    height: transform.displayH,
                                    left: transform.left,
                                    top: transform.top,
                                }}
                                resizeMode="cover"
                            />
                        )}

                        <View pointerEvents="none" style={[styles.dimOverlay, { left: 0, right: 0, top: 0, height: transform.frameTop }]} />
                        <View pointerEvents="none" style={[styles.dimOverlay, { left: 0, right: 0, top: transform.frameTop + frame.height, bottom: 0 }]} />
                        <View pointerEvents="none" style={[styles.dimOverlay, { left: 0, top: transform.frameTop, width: transform.frameLeft, height: frame.height }]} />
                        <View pointerEvents="none" style={[styles.dimOverlay, { right: 0, top: transform.frameTop, width: transform.frameLeft, height: frame.height }]} />

                        <View
                            style={[
                                styles.frameBorder,
                                {
                                    left: transform.frameLeft,
                                    top: transform.frameTop,
                                    width: frame.width,
                                    height: frame.height,
                                    borderRadius: frame.radius,
                                },
                            ]}
                            pointerEvents="none"
                        />
                    </View>

                    <View style={styles.controlsRow}>
                        <TouchableOpacity style={styles.zoomBtn} onPress={() => adjustZoom(-0.15)}>
                            <Text style={styles.zoomBtnText}>-</Text>
                        </TouchableOpacity>
                        <Text style={styles.zoomText}>Zoom {Math.round(zoom * 100)}%</Text>
                        <TouchableOpacity style={styles.zoomBtn} onPress={() => adjustZoom(0.15)}>
                            <Text style={styles.zoomBtnText}>+</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.footerRow}>
                        <TouchableOpacity style={styles.footerBtn} onPress={onCancel} disabled={isWorking}>
                            <Text style={styles.footerBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.footerBtn, styles.footerBtnPrimary]} onPress={handleConfirm} disabled={isWorking}>
                            <Text style={styles.footerBtnTextPrimary}>Use Crop</Text>
                        </TouchableOpacity>
                    </View>

                    {isWorking && (
                        <View style={styles.loadingWrap}>
                            <ActivityIndicator size="small" color={colors.primary} />
                            <Text style={styles.loadingText}>Processing image...</Text>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

export default ImageCropperModal;
