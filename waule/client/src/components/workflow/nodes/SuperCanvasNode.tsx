import { useState, useEffect, useRef, memo } from 'react';
import { Position, NodeProps, useReactFlow, useEdges, useNodes } from 'reactflow';
import * as fabric from 'fabric';
import {
    MousePointer2,
    Pencil,
    Brush,
    Type,
    Eraser,
    MoveUp,
    MoveDown,
    Trash2,
    ArrowRight,
    Minus,
    Crop
} from 'lucide-react';
import CustomHandle from '../CustomHandle';
import { apiClient } from '../../../lib/api';

interface SuperCanvasNodeData {
    label?: string;
    width?: number;
    height?: number;
    backgroundColor?: string;
    imageUrl?: string; // Input image URL
    inputImage?: string; // Alternative key
}

type ToolType = 'select' | 'pencil' | 'brush' | 'line' | 'arrow' | 'text' | 'eraser' | 'crop';

const SuperCanvasNode = ({ data, id, selected }: NodeProps<SuperCanvasNodeData>) => {
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const fabricCanvas = useRef<fabric.Canvas | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { getNodes, getEdges, setNodes, setEdges, getNode, getViewport } = useReactFlow();

    // Use hooks to react to graph changes
    const edges = useEdges();
    const nodes = useNodes();

    // State
    const [activeTool, setActiveTool] = useState<ToolType | null>(null); // Default to no tool selected
    const [brushColor, setBrushColor] = useState('#7c3aed');
    const [brushSize, setBrushSize] = useState(100);

    // Refs for drawing
    const isDrawingRef = useRef(false);
    const startPointRef = useRef<{ x: number, y: number } | null>(null);
    const activeObjectRef = useRef<fabric.Object | null>(null);
    const cropRectRef = useRef<fabric.Rect | null>(null);
    
    // Track which source nodes have been processed to avoid duplicate imports
    const processedSourceNodesRef = useRef<Set<string>>(new Set());
    const brushCursorRef = useRef<HTMLDivElement | null>(null);
    const saveTimerRef = useRef<number | null>(null);

    // Track applied crop for export
    const appliedCropRef = useRef<{ left: number, top: number, width: number, height: number } | null>(null);

    // Internal resolution
    const INTERNAL_SIZE = 4096;

    // Display dimensions (node size in the graph)
    const displayWidth = data.width || 800;
    const displayHeight = data.width || 800;

    const width = INTERNAL_SIZE;
    const height = INTERNAL_SIZE;

    // ... (existing code)

    // Initialize Canvas
    useEffect(() => {
        if (!canvasContainerRef.current || fabricCanvas.current) return;

        

        const canvasEl = document.createElement('canvas');
        canvasEl.width = width;
        canvasEl.height = height;
        canvasContainerRef.current.appendChild(canvasEl);

        const canvas = new fabric.Canvas(canvasEl, {
            width: width,
            height: height,
            backgroundColor: 'transparent', // Transparent to allow "outside" crop to show through
            selection: false,
            preserveObjectStacking: true,
        });

        // Add a white background rect to act as the "paper"
        // This ensures the content area is white, while the "outside" (when clipped) is transparent
        const bgRect = new fabric.Rect({
            left: 0,
            top: 0,
            width: width,
            height: height,
            fill: '#ffffff',
            selectable: false,
            evented: false,
            excludeFromExport: true, // We handle background manually during export if needed, or keep it
            name: '__background__',
        });
        canvas.add(bgRect);
        canvas.sendObjectToBack(bgRect);

        canvas.perPixelTargetFind = true;
        canvas.targetFindTolerance = 8;

        const scale = displayWidth / width;
        canvas.setDimensions({ width: displayWidth, height: displayHeight });
        canvas.setZoom(scale);

        canvasEl.style.width = `${displayWidth} px`;
        canvasEl.style.height = `${displayHeight} px`;

        fabricCanvas.current = canvas;
        (fabric.Object.prototype as any).borderColor = '#ff2d55';
        (fabric.Object.prototype as any).cornerColor = '#ff2d55';
        (fabric.Object.prototype as any).cornerStrokeColor = '#ff2d55';
        (fabric.Object.prototype as any).selectionBorderColor = '#ff2d55';
        (fabric.Object.prototype as any).selectionColor = 'rgba(255,45,85,0.08)';
        (fabric.Object.prototype as any).transparentCorners = false;
        (fabric.Object.prototype as any).cornerSize = 12;
        (fabric.Object.prototype as any).selectionLineWidth = 2;
        (fabric.Object.prototype as any).borderScaleFactor = 2;
        const rotateCursor = `url(\\\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='9' fill='none' stroke='%23ff2d55' stroke-width='2'/><path d='M16 8l3 0-1.5-2.5' fill='%23ff2d55'/><path d='M8 16l-3 0 1.5 2.5' fill='%23ff2d55'/></svg>\\\") 12 12, pointer`;
        (canvas as any).rotationCursor = rotateCursor;
        const controls = (fabric.Object.prototype as any).controls || {};
        if (controls.tl) { controls.tl.cursorStyle = 'nwse-resize'; controls.tl.cornerStyle = 'square'; }
        if (controls.br) { controls.br.cursorStyle = 'nwse-resize'; controls.br.cornerStyle = 'square'; }
        if (controls.tr) { controls.tr.cursorStyle = 'nesw-resize'; controls.tr.cornerStyle = 'square'; }
        if (controls.bl) { controls.bl.cursorStyle = 'nesw-resize'; controls.bl.cornerStyle = 'square'; }
        if (controls.mtr) { controls.mtr.cursorStyle = rotateCursor; controls.mtr.cornerStyle = 'circle'; }

        const applySelectionStyle = (obj: any) => {
            if (!obj) return;
            obj.borderColor = '#ff2d55';
            obj.cornerColor = '#ff2d55';
            obj.cornerStrokeColor = '#ff2d55';
            obj.transparentCorners = false;
            obj.cornerSize = 12;
            obj.hasBorders = true;
            obj.hasControls = true;
        };

        const syncActiveSelection = () => {
            const active = canvas.getActiveObject() as any;
            if (!active) return;
            if (active.type === 'activeSelection' && Array.isArray(active._objects)) {
                active._objects.forEach(applySelectionStyle);
            }
            applySelectionStyle(active);
            canvas.requestRenderAll();
        };

        canvas.on('selection:created', syncActiveSelection);
        canvas.on('selection:updated', syncActiveSelection);
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);

        const persistCanvas = () => {
            const c = fabricCanvas.current;
            if (!c) return;
            const json: any = (c as any).toJSON(['name','sourceNodeId','originalUrl']);
            if (Array.isArray(json.objects)) {
                json.objects = json.objects.map((o: any) => {
                    if (o && o.type === 'image') {
                        if (o.originalUrl) o.src = o.originalUrl;
                    }
                    return o;
                });
            }
            
            // Save crop state
            const saveData = {
                canvasJson: json,
                appliedCrop: appliedCropRef.current,
            };
            
            const str = JSON.stringify(saveData);
            try { localStorage.setItem(`superCanvas:${id}`, str); } catch {}
            const currentNode = getNode(id);
            if (currentNode) {
                setNodes((nds) => nds.map((node) => node.id === id ? { ...node, data: { ...(node.data as any), canvasState: str } } : node));
            }
        };

        const schedulePersist = () => {
            if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
            saveTimerRef.current = window.setTimeout(() => { persistCanvas(); }, 300);
        };

        canvas.on('object:added', schedulePersist);
        canvas.on('object:modified', schedulePersist);
        canvas.on('object:removed', schedulePersist);
        canvas.on('path:created', schedulePersist as any);

        // Load saved state (try new format first, fallback to old format)
        const savedState = (getNode(id) as any)?.data?.canvasState || localStorage.getItem(`superCanvas:${id}`);
        const savedOld = (getNode(id) as any)?.data?.canvasJson; // Old format fallback
        
        if (savedState || savedOld) {
            try {
                let canvasData: any;
                let savedCrop: any = null;
                
                if (savedState) {
                    const parsed = JSON.parse(savedState);
                    if (parsed.canvasJson) {
                        // New format
                        canvasData = parsed.canvasJson;
                        savedCrop = parsed.appliedCrop;
                    } else {
                        // Old format (direct JSON)
                        canvasData = parsed;
                    }
                } else if (savedOld) {
                    canvasData = JSON.parse(savedOld);
                }
                
                const obj: any = canvasData;

                const sanitizeObject = (o: any): any => {
                    if (!o || typeof o !== 'object') return o;
                    if (o.type === 'image') {
                        if (o.originalUrl) {
                            o.src = o.originalUrl;
                        } else if (o.sourceNodeId) {
                            const srcNode = getNode(o.sourceNodeId) as any;
                            const candidate = srcNode?.data?.imageUrl || srcNode?.data?.url || srcNode?.data?.output || srcNode?.data?.config?.generatedImageUrl || srcNode?.data?.config?.uploadedFiles?.[0]?.url;
                            if (candidate) { o.originalUrl = candidate; o.src = candidate; }
                        }
                        if (typeof o.src === 'string' && o.src.startsWith('blob:')) {
                            return null;
                        }
                        return o;
                    }
                    if (Array.isArray(o.objects)) {
                        o.objects = o.objects.map(sanitizeObject).filter(Boolean);
                        if (o.type === 'group' && o.objects.length === 0) return null;
                    }
                    return o;
                };

                const fixImg = (img: any) => {
                    if (!img) return img;
                    if (typeof img?.src === 'string' && img.src.startsWith('blob:')) return null;
                    if (img.type === 'image') return sanitizeObject(img);
                    return img;
                };

                const dropBlobProperties = (x: any): any => {
                    if (!x) return x;
                    if (Array.isArray(x)) return x.map(dropBlobProperties).filter(Boolean);
                    if (typeof x === 'object') {
                        if (x.type === 'image' && typeof x.src === 'string' && x.src.startsWith('blob:')) return null;
                        Object.keys(x).forEach((k) => {
                            const v = x[k];
                            if (typeof v === 'string' && v.startsWith('blob:')) {
                                if (k === 'src' || k === 'source') {
                                    x[k] = undefined;
                                } else {
                                    x[k] = undefined;
                                }
                            } else if (v && typeof v === 'object') {
                                const vv = dropBlobProperties(v);
                                if (vv === null) {
                                    delete x[k];
                                } else {
                                    x[k] = vv;
                                }
                            }
                        });
                        if (Array.isArray(x.objects)) {
                            x.objects = x.objects.map(dropBlobProperties).filter(Boolean);
                            if (x.type === 'group' && x.objects.length === 0) return null;
                        }
                    }
                    return x;
                };

                if (Array.isArray(obj.objects)) {
                    obj.objects = obj.objects.map(sanitizeObject).filter(Boolean);
                }
                if (obj.backgroundImage) obj.backgroundImage = fixImg(obj.backgroundImage);
                if (obj.overlayImage) obj.overlayImage = fixImg(obj.overlayImage);
                if (obj.clipPath) obj.clipPath = sanitizeObject(obj.clipPath);
                const cleaned = dropBlobProperties(obj);

                canvas.loadFromJSON(cleaned).then(() => {
                    const bgRect2 = new fabric.Rect({
                        left: 0,
                        top: 0,
                        width: width,
                        height: height,
                        fill: '#ffffff',
                        selectable: false,
                        evented: false,
                        excludeFromExport: true,
                        name: '__background__',
                    } as any);
                    canvas.add(bgRect2);
                    const bg = canvas.getObjects().find(o => (o as any).name === '__background__');
                    if (bg) canvas.sendObjectToBack(bg);
                    
                    // Restore crop state if exists
                    if (savedCrop) {
                        appliedCropRef.current = savedCrop;
                        const { left, top, width: cropW, height: cropH } = savedCrop;
                        
                        // Apply clipPath
                        const clipRect = new fabric.Rect({
                            left,
                            top,
                            width: cropW,
                            height: cropH,
                            absolutePositioned: true,
                        });
                        canvas.clipPath = clipRect;
                        
                        // Adjust background to match cropped area
                        if (bg) {
                            (bg as fabric.Rect).set({
                                left,
                                top,
                                width: cropW,
                                height: cropH,
                            });
                        }
                    }
                    
                    canvas.requestRenderAll();
                });
            } catch {}
        }

        if (canvasContainerRef.current) {
            canvasContainerRef.current.classList.add('nodrag');
        }

        return () => {
            
            canvas.dispose();
            fabricCanvas.current = null;
            if (canvasContainerRef.current) {
                canvasContainerRef.current.innerHTML = '';
            }
        };
    }, [id, width, height, displayWidth]);

    // Auto-adjust brush size when switching tools
    useEffect(() => {
        if (activeTool === 'brush') {
            if (brushSize < 80 || brushSize > 400) {
                setBrushSize(100);
            }
        } else if (activeTool === 'pencil' || activeTool === 'line' || activeTool === 'arrow') {
            if (brushSize < 10 || brushSize > 30) {
                setBrushSize(15);
            }
        }
    }, [activeTool, brushSize]);

    // Use hooks to react to graph changes
    // To react to changes, we need to rely on the fact that React Flow re-renders nodes when graph changes if we use the store or hooks.
    // However, standard node props don't update on edge changes. 
    // We will use a polling or event listener approach if hooks aren't triggering, but let's try to use the edges from the store if possible.
    // Actually, let's just use the standard getEdges inside useEffect with a dependency on edges if we can get them.
    // Since we can't easily import useEdges if it's not exported, we will rely on the fact that we can get edges.
    // But to trigger the effect, we need something to change. 
    // Let's use a custom hook or just assume the parent passes props? No.
    // We will use an interval to check for new connections or just rely on React Flow's internal updates.
    // Better: useNodes and useEdges are available in v11. Let's try to import them.

    // Wait, the previous file content showed `import { Position, NodeProps, useReactFlow } from 'reactflow'; `
    // I will add `useEdges, useNodes` to the import.

    // ... (inside component)

    // Handle Input Images
    useEffect(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        const API_URL = import.meta.env.VITE_API_URL || '';

        // Find all edges connected to this node's input-image handle
        const inputEdges = edges.filter(e => e.target === id && e.targetHandle === 'input-image');

        

        // Process each connection
        inputEdges.forEach(async (edge) => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            if (!sourceNode) return;

            // Check if we've already processed this source node
            if (processedSourceNodesRef.current.has(sourceNode.id)) {
                return;
            }

            let imgUrl: string | undefined;
            const nodeData = sourceNode.data as any;

            // Determine image URL based on node type
            if (sourceNode.type === 'upload') {
                const files = nodeData?.config?.uploadedFiles;
                if (files && files.length > 0) {
                    const file = files[0];
                    if (file.type === 'IMAGE' || file.mimeType?.startsWith('image/')) {
                        imgUrl = file.url;
                    }
                }
            } else if (sourceNode.type === 'imagePreview') {
                imgUrl = nodeData?.imageUrl;
            } else {
                // Generic fallback
                imgUrl = nodeData?.imageUrl || nodeData?.output || nodeData?.url;
            }

            if (!imgUrl) {
                
                return;
            }

            // Normalize URL - add API_URL if needed
            let fullUrl = imgUrl;
            if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
                fullUrl = `${API_URL}${imgUrl}`;
            }
            // Replace localhost references
            fullUrl = fullUrl.replace(/^https?:\/\/localhost(?::\d+)?/i, API_URL);

            // Check if this image is already on the canvas (linked to this source node)
            const existingObj = canvas.getObjects().find(o => (o as any).sourceNodeId === sourceNode.id);

            if (existingObj) {
                // Mark as processed even if already on canvas
                processedSourceNodesRef.current.add(sourceNode.id);
                return;
            }

            // Mark as being processed before async operations
            processedSourceNodesRef.current.add(sourceNode.id);

            

            try {
                // Use proxy download to avoid CORS issues
                const arrayBuffer = await apiClient.assets.proxyDownload(fullUrl);

                // Detect MIME type from the array buffer
                const bytes = new Uint8Array(arrayBuffer);
                let mimeType = 'image/png'; // default

                if (bytes.length >= 4) {
                    // PNG: 89 50 4E 47
                    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
                        mimeType = 'image/png';
                    }
                    // JPEG: FF D8 FF
                    else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
                        mimeType = 'image/jpeg';
                    }
                    // GIF: 47 49 46
                    else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
                        mimeType = 'image/gif';
                    }
                    // WebP: 52 49 46 46 ... 57 45 42 50
                    else if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
                        if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
                            mimeType = 'image/webp';
                        }
                    }
                }

                // Create blob from array buffer
                const blob = new Blob([arrayBuffer], { type: mimeType });
                const blobUrl = URL.createObjectURL(blob);

                

                // Load image from blob URL
                const img = await fabric.Image.fromURL(blobUrl);

                if (!img) {
                    URL.revokeObjectURL(blobUrl);
                    return;
                }

                

                // Use native resolution (scale 1)
                // Center the image, maybe add a slight offset based on index to avoid perfect overlap?
                const offset = inputEdges.indexOf(edge) * 20;

                img.set({
                    scaleX: 1,
                    scaleY: 1,
                    left: (width - img.width!) / 2 + offset,
                    top: (height - img.height!) / 2 + offset,
                    selectable: true,
                    // Lock aspect ratio - prevent distortion
                    lockScalingFlip: true,  // Prevent flipping
                    lockUniScaling: false,   // Allow uniform scaling
                    // Force uniform scaling by locking aspect ratio
                    // When user drags corner, both width and height scale together
                    name: '__input_image__',
                    // Custom property to track source
                    sourceNodeId: sourceNode.id,
                    originalUrl: fullUrl,
                    borderColor: '#ff2d55',
                    cornerColor: '#ff2d55',
                    cornerStrokeColor: '#ff2d55',
                    transparentCorners: false,
                    cornerSize: 12,
                } as any);

                // Lock aspect ratio after setting properties
                // This ensures the image can only be scaled uniformly
                (img as any).setControlsVisibility({
                    mt: false, // middle top
                    mb: false, // middle bottom
                    ml: false, // middle left
                    mr: false, // middle right
                    // Only allow corner controls for uniform scaling
                });

                canvas.add(img);

                // Send to back but above background
                const bg = canvas.getObjects().find(o => (o as any).name === '__background__');
                if (bg) {
                    canvas.sendObjectToBack(img);
                    canvas.sendObjectToBack(bg);
                } else {
                    canvas.sendObjectToBack(img);
                }

                canvas.requestRenderAll();
                

                // Clean up blob URL after a delay
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

            } catch (err) {
            }
        });

        // Clean up processed nodes that are no longer connected
        const currentSourceNodeIds = new Set(
            inputEdges
                .map(e => nodes.find(n => n.id === e.source)?.id)
                .filter(Boolean) as string[]
        );
        
        // Remove source nodes that are no longer connected and delete their images from canvas
        const toRemove: string[] = [];
        processedSourceNodesRef.current.forEach(nodeId => {
            if (!currentSourceNodeIds.has(nodeId)) {
                toRemove.push(nodeId);
                
                // Remove the image from canvas
                const objToRemove = canvas.getObjects().find(o => (o as any).sourceNodeId === nodeId);
                if (objToRemove) {
                    canvas.remove(objToRemove);
                    canvas.requestRenderAll();
                }
            }
        });
        toRemove.forEach(nodeId => processedSourceNodesRef.current.delete(nodeId));

    }, [edges, nodes, id, width, height]); // Re-run when graph changes (if getEdges/getNodes return new refs or if we poll)

    // To ensure we react to edge changes, we might need to use the useEdges hook if available.
    // I will add the import in a separate edit if needed, but for now let's assume getEdges is enough if the component re-renders.
    // If the component doesn't re-render on edge changes, this effect won't run.
    // React Flow nodes only re-render on data change or selection change usually.
    // To force update on edge changes, we can use `useStore` or `useEdges`.

    // Let's try to add a listener or use a hook.
    // Since I can't easily change imports in this block without replacing the whole file header, 
    // I will rely on the fact that the user might interact or I can use an interval? No.
    // Actually, `useReactFlow` provides `getEdges`. 
    // I'll add a periodic check or just hope the user triggers a render (e.g. by selecting).
    // BUT, to be safe, I will modify the imports in a separate step to include `useEdges` if I can.
    // For now, let's just put the logic in.



    // Handle Tool Switching
    useEffect(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        canvas.isDrawingMode = false;
        canvas.defaultCursor = 'default';
        canvas.selection = true;
        (canvas as any).skipTargetFind = false;

        if (activeTool === null) {
            canvas.isDrawingMode = false;
            canvas.selection = false;
            (canvas as any).skipTargetFind = true;
            canvas.defaultCursor = 'default';
            canvas.getObjects().forEach((o) => {
                if ((o as any).name !== '__background__' && (o as any).name !== '__crop__') {
                    o.selectable = false;
                    o.evented = false;
                }
            });
            if (brushCursorRef.current) {
                brushCursorRef.current.style.display = 'none';
            }
            
            // Maintain crop state if exists
            if (appliedCropRef.current) {
                const { left, top, width: cropW, height: cropH } = appliedCropRef.current;
                const clipRect = new fabric.Rect({
                    left,
                    top,
                    width: cropW,
                    height: cropH,
                    absolutePositioned: true,
                });
                canvas.clipPath = clipRect;
                const bg = canvas.getObjects().find(o => (o as any).name === '__background__');
                if (bg) {
                    (bg as fabric.Rect).set({ left, top, width: cropW, height: cropH });
                }
            }
            
            return;
        }

        const enc = brushColor.startsWith('#') ? `%23${brushColor.slice(1)}` : encodeURIComponent(brushColor);
        const pencilCursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M3 17L14 6l4 4L7 21H3z' fill='${enc}' stroke='%23ffffff' stroke-width='1.2'/></svg>") 3 20, crosshair`;
        // 橡皮擦光标：圆形 + 十字准星，中心点对齐
        const eraserCursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='none' stroke='%23ff6b6b' stroke-width='2'/><path d='M12 6V18M6 12H18' stroke='%23ff6b6b' stroke-width='1.5'/><circle cx='12' cy='12' r='2' fill='%23ff6b6b'/></svg>") 12 12, crosshair`;
        if (activeTool === 'pencil' || activeTool === 'brush') {
            canvas.isDrawingMode = true;
            canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
            // 30% opacity over current color
            const toRgba = (hex: string, alpha: number) => {
                const h = hex.replace('#','');
                const r = parseInt(h.substring(0,2),16);
                const g = parseInt(h.substring(2,4),16);
                const b = parseInt(h.substring(4,6),16);
                return `rgba(${r},${g},${b},${alpha})`;
            };
            canvas.freeDrawingBrush.color = toRgba(brushColor, 0.7);
            canvas.freeDrawingBrush.width = brushSize;
            
            // Maintain crop state if exists
            if (appliedCropRef.current) {
                const { left, top, width: cropW, height: cropH } = appliedCropRef.current;
                const clipRect = new fabric.Rect({
                    left,
                    top,
                    width: cropW,
                    height: cropH,
                    absolutePositioned: true,
                });
                canvas.clipPath = clipRect;
                const bg = canvas.getObjects().find(o => (o as any).name === '__background__');
                if (bg) {
                    (bg as fabric.Rect).set({ left, top, width: cropW, height: cropH });
                }
            }
            const crosshairCursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M0 16 H32 M16 0 V32' stroke='%23000000' stroke-width='4'/><path d='M0 16 H32 M16 0 V32' stroke='${enc}' stroke-width='2.2'/></svg>") 16 16, crosshair`;
            if (activeTool === 'pencil') {
                canvas.freeDrawingCursor = pencilCursor as any;
                canvas.defaultCursor = pencilCursor as any;
                (canvas as any).hoverCursor = pencilCursor as any;
                (canvas as any).moveCursor = pencilCursor as any;
                if ((canvas as any).upperCanvasEl) { (canvas as any).upperCanvasEl.style.cursor = pencilCursor as any; }
            } else {
                canvas.freeDrawingCursor = crosshairCursor as any;
                canvas.defaultCursor = crosshairCursor as any;
                (canvas as any).hoverCursor = crosshairCursor as any;
                (canvas as any).moveCursor = crosshairCursor as any;
                if ((canvas as any).upperCanvasEl) { (canvas as any).upperCanvasEl.style.cursor = crosshairCursor as any; }
            }
            canvas.selection = false;
            canvas.getObjects().forEach((o) => {
                if ((o as any).name !== '__background__' && (o as any).name !== '__crop__') {
                    o.selectable = true;
                    o.evented = true;
                }
            });
            if (activeTool === 'brush' && brushCursorRef.current) {
                brushCursorRef.current.style.display = 'block';
            }
            if (activeTool === 'pencil' && brushCursorRef.current) {
                brushCursorRef.current.style.display = 'none';
            }
        } else if (activeTool === 'crop') {
            canvas.selection = false;
            canvas.defaultCursor = 'crosshair';

            // Remove clipPath to show full canvas for cropping
            canvas.clipPath = undefined;
            
            // Restore background to full size
            const bg = canvas.getObjects().find(o => (o as any).name === '__background__');
            if (bg) {
                (bg as fabric.Rect).set({
                    left: 0,
                    top: 0,
                    width: width,
                    height: height,
                });
            }
            
            canvas.requestRenderAll();

            let rect = cropRectRef.current;

            // Create crop rect with margin from edges (e.g., 10% inset)
            const margin = width * 0.1; // 10% margin from each edge
            const defaultCropWidth = width - (margin * 2);
            const defaultCropHeight = height - (margin * 2);

            // If no rect exists, create one with margin
            if (!rect || !canvas.getObjects().includes(rect)) {
                const initialCrop = appliedCropRef.current || {
                    left: margin,
                    top: margin,
                    width: defaultCropWidth,
                    height: defaultCropHeight
                };

                rect = new fabric.Rect({
                    left: initialCrop.left,
                    top: initialCrop.top,
                    width: initialCrop.width,
                    height: initialCrop.height,
                    fill: 'rgba(0,0,0,0)',
                    stroke: '#22d3ee',
                    strokeWidth: 8,
                    cornerColor: '#22d3ee',
                    cornerStrokeColor: '#0891b2',
                    borderColor: '#22d3ee',
                    cornerStyle: 'circle',
                    cornerSize: 12,
                    transparentCorners: false,
                    hasBorders: true,
                    hasControls: true,
                    lockRotation: true,
                    originX: 'left',
                    originY: 'top',
                    name: '__crop__',
                    excludeFromExport: true
                } as any);
                cropRectRef.current = rect;
                canvas.add(rect);
            }

            if (rect) {
                rect.visible = true;
                rect.selectable = true;
                rect.evented = true;
                canvas.setActiveObject(rect);
                canvas.requestRenderAll();
            }
        } else if (activeTool === 'line' || activeTool === 'arrow' || activeTool === 'text' || activeTool === 'eraser') {
            canvas.selection = false;
            
            // Maintain crop state if exists
            if (appliedCropRef.current) {
                const { left, top, width: cropW, height: cropH } = appliedCropRef.current;
                const clipRect = new fabric.Rect({
                    left,
                    top,
                    width: cropW,
                    height: cropH,
                    absolutePositioned: true,
                });
                canvas.clipPath = clipRect;
                const bg = canvas.getObjects().find(o => (o as any).name === '__background__');
                if (bg) {
                    (bg as fabric.Rect).set({ left, top, width: cropW, height: cropH });
                }
            }
            
            const crosshairCursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M0 16 H32 M16 0 V32' stroke='%23000000' stroke-width='4'/><path d='M0 16 H32 M16 0 V32' stroke='${enc}' stroke-width='2.2'/></svg>") 16 16, crosshair`;
            canvas.defaultCursor = (activeTool === 'text') ? 'text' : (activeTool === 'eraser') ? (eraserCursor as any) : (crosshairCursor as any);
            if ((canvas as any).upperCanvasEl) { (canvas as any).upperCanvasEl.style.cursor = canvas.defaultCursor as any; }
            if (activeTool === 'line' || activeTool === 'arrow') {
                (canvas as any).hoverCursor = crosshairCursor as any;
                (canvas as any).moveCursor = crosshairCursor as any;
                (canvas as any).skipTargetFind = true;
                canvas.discardActiveObject();
                canvas.getObjects().forEach((o) => {
                    if ((o as any).name !== '__background__' && (o as any).name !== '__crop__') {
                        o.selectable = false;
                        o.evented = false;
                    }
                });
                if (brushCursorRef.current) { brushCursorRef.current.style.display = 'none'; }
            } else {
                (canvas as any).skipTargetFind = false;
                canvas.getObjects().forEach((o) => {
                    if ((o as any).name !== '__background__' && (o as any).name !== '__crop__') {
                        o.selectable = true;
                        o.evented = true;
                    }
                });
                if (activeTool === 'eraser' && brushCursorRef.current) { brushCursorRef.current.style.display = 'none'; }
                if (activeTool === 'eraser') {
                    (canvas as any).moveCursor = eraserCursor as any;
                    (canvas as any).hoverCursor = eraserCursor as any;
                }
            }
            if (brushCursorRef.current) {
                brushCursorRef.current.style.display = 'none';
            }
        } else {
            // Select tool
            // Hide the crop rect when switching away
            if (cropRectRef.current) {
                cropRectRef.current.visible = false;
                canvas.discardActiveObject();
            }

            // If we have an applied crop, keep the clipPath
            if (appliedCropRef.current) {
                const { left, top, width: cropW, height: cropH } = appliedCropRef.current;

                // Apply clipPath to hide content outside crop
                const clipRect = new fabric.Rect({
                    left,
                    top,
                    width: cropW,
                    height: cropH,
                    absolutePositioned: true,
                });
                canvas.clipPath = clipRect;

                // Keep the background matching the cropped area
                const bg = canvas.getObjects().find(o => (o as any).name === '__background__');
                if (bg) {
                    (bg as fabric.Rect).set({
                        left,
                        top,
                        width: cropW,
                        height: cropH,
                    });
                }
            }

            canvas.requestRenderAll();
            (canvas as any).skipTargetFind = false;
            canvas.getObjects().forEach((o) => {
                if ((o as any).name !== '__background__' && (o as any).name !== '__crop__') {
                    o.selectable = true;
                    o.evented = true;
                }
            });
            canvas.defaultCursor = 'default';
            (canvas as any).hoverCursor = 'default';
            (canvas as any).moveCursor = 'default';
            if ((canvas as any).upperCanvasEl) { (canvas as any).upperCanvasEl.style.cursor = 'default'; }
            if (brushCursorRef.current) {
                brushCursorRef.current.style.display = 'none';
            }
        }

    }, [activeTool, brushColor, brushSize, width, height, displayWidth, displayHeight]);

    // Handle Keys (Enter for Crop, Esc for Cancel)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;

            if (e.key === 'Escape') {
                setActiveTool('select');
            } else if (e.key === 'Enter' && activeTool === 'crop') {
                // Apply Crop
                const rect = cropRectRef.current;
                if (rect) {
                    // Normalize rect dimensions
                    const left = Math.max(0, Math.floor(rect.left ?? 0));
                    const top = Math.max(0, Math.floor(rect.top ?? 0));
                    const w = Math.max(1, Math.floor((rect.width ?? 0) * (rect.scaleX ?? 1)));
                    const h = Math.max(1, Math.floor((rect.height ?? 0) * (rect.scaleY ?? 1)));

                    appliedCropRef.current = { left, top, width: w, height: h };

                    

                    // Apply clipPath to hide content outside crop
                    const clipRect = new fabric.Rect({
                        left,
                        top,
                        width: w,
                        height: h,
                        absolutePositioned: true,
                    });
                    canvas.clipPath = clipRect;

                    // Update the background to only cover the cropped area
                    const bg = canvas.getObjects().find(o => (o as any).name === '__background__');
                    if (bg) {
                        (bg as fabric.Rect).set({
                            left,
                            top,
                            width: w,
                            height: h,
                        });
                    }

                    // Hide the editable rect
                    rect.visible = false;

                    // Switch to select tool
                    setActiveTool('select');

                    canvas.requestRenderAll();
                    
                    // Trigger save to persist crop state
                    const persistCanvas = fabricCanvas.current ? () => {
                        const c = fabricCanvas.current;
                        if (!c) return;
                        const json: any = (c as any).toJSON(['name','sourceNodeId','originalUrl']);
                        if (Array.isArray(json.objects)) {
                            json.objects = json.objects.map((o: any) => {
                                if (o && o.type === 'image') {
                                    if (o.originalUrl) o.src = o.originalUrl;
                                }
                                return o;
                            });
                        }
                        const saveData = {
                            canvasJson: json,
                            appliedCrop: appliedCropRef.current,
                        };
                        const str = JSON.stringify(saveData);
                        try { localStorage.setItem(`superCanvas:${id}`, str); } catch {}
                        const currentNode = getNode(id);
                        if (currentNode) {
                            setNodes((nds) => nds.map((node) => node.id === id ? { ...node, data: { ...(node.data as any), canvasState: str } } : node));
                        }
                    } : null;
                    if (persistCanvas) persistCanvas();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeTool]);

    // Handle Drawing Interactions
    useEffect(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        const handleMouseDown = (opt: any) => {
            const pointer = canvas.getPointer(opt.e);
            isDrawingRef.current = true;
            startPointRef.current = { x: pointer.x, y: pointer.y };

            if (activeTool === 'line' || activeTool === 'arrow') {
                canvas.discardActiveObject();
                (canvas as any).skipTargetFind = true;
                canvas.getObjects().forEach((o) => {
                    if ((o as any).name !== '__background__' && (o as any).name !== '__crop__') {
                        o.selectable = false;
                        o.evented = false;
                    }
                });
            }

            if (activeTool === 'line') {
                const points: [number, number, number, number] = [pointer.x, pointer.y, pointer.x, pointer.y];
                const line = new fabric.Line(points, {
                    strokeWidth: brushSize / 2,
                    fill: brushColor,
                    stroke: brushColor,
                    originX: 'center',
                    originY: 'center',
                    strokeLineCap: 'round'
                });
                activeObjectRef.current = line;
                canvas.add(line);
            } else if (activeTool === 'arrow') {
                const points: [number, number, number, number] = [pointer.x, pointer.y, pointer.x, pointer.y];
                const line = new fabric.Line(points, {
                    strokeWidth: brushSize / 2,
                    fill: brushColor,
                    stroke: brushColor,
                    originX: 'center',
                    originY: 'center',
                    strokeLineCap: 'round',
                    objectCaching: false
                });
                activeObjectRef.current = line;
                canvas.add(line);
            } else if (activeTool === 'text') {
                const tb = new fabric.Textbox('Type here', {
                    left: pointer.x,
                    top: pointer.y,
                    fontFamily: 'Arial',
                    fill: brushColor,
                    fontSize: brushSize * 10,
                    width: 300,
                    splitByGrapheme: true,
                } as any);
                (tb as any).lockScalingY = false;
                (tb as any).lockScalingFlip = true;
                (tb as any).lockUniScaling = false;
                (tb as any).setControlsVisibility({ mt: false, mb: false } as any);
                canvas.add(tb);
                canvas.setActiveObject(tb);
                (tb as any).enterEditing();
                setActiveTool('select');
            } else if (activeTool === 'eraser') {
                // 主动检测指针位置下的对象
                const objects = canvas.getObjects();
                for (let i = objects.length - 1; i >= 0; i--) {
                    const obj = objects[i] as any;
                    if (obj.name === '__background__' || obj.name === '__crop__' || obj.name === '__input_image__' || obj.sourceNodeId) continue;
                    if (obj.containsPoint(pointer)) {
                        canvas.remove(obj);
                        break; // 点击只删除最上层的一个
                    }
                }
                canvas.requestRenderAll();
            }
        };

        const handleMouseMove = (opt: any) => {
            const pointer = canvas.getPointer(opt.e);
            if (activeTool === 'brush' && brushCursorRef.current) {
                const scale = canvas.getZoom();
                const size = brushSize * scale;
                const r = size / 2;
                brushCursorRef.current.style.width = `${size}px`;
                brushCursorRef.current.style.height = `${size}px`;
                brushCursorRef.current.style.left = `${(pointer.x * scale - r)}px`;
                brushCursorRef.current.style.top = `${(pointer.y * scale - r)}px`;
                brushCursorRef.current.style.borderColor = `rgba(${parseInt(brushColor.slice(1,3),16)},${parseInt(brushColor.slice(3,5),16)},${parseInt(brushColor.slice(5,7),16)},0.7)`;
                brushCursorRef.current.style.borderWidth = '1px';
                brushCursorRef.current.style.background = 'transparent';
            }
            if (!isDrawingRef.current) return;
            const activeObj = activeObjectRef.current;

            if (activeTool === 'line' && activeObj && activeObj instanceof fabric.Line) {
                activeObj.set({ x2: pointer.x, y2: pointer.y });
                activeObj.setCoords();
                canvas.requestRenderAll();
            } else if (activeTool === 'arrow' && activeObj && activeObj instanceof fabric.Line) {
                activeObj.set({ x2: pointer.x, y2: pointer.y });
                activeObj.setCoords();
                canvas.requestRenderAll();
            } else if (activeTool === 'eraser') {
                // 主动检测指针位置下的所有对象（不依赖 opt.target，因为拖动时可能检测不到）
                const objects = canvas.getObjects();
                for (let i = objects.length - 1; i >= 0; i--) {
                    const obj = objects[i] as any;
                    if (obj.name === '__background__' || obj.name === '__crop__' || obj.name === '__input_image__' || obj.sourceNodeId) continue;
                    if (obj.containsPoint(pointer)) {
                        canvas.remove(obj);
                    }
                }
                canvas.requestRenderAll();
            }
        };

        const handleMouseUp = () => {
            isDrawingRef.current = false;

            if (activeTool === 'arrow' && activeObjectRef.current instanceof fabric.Line) {
                const line = activeObjectRef.current;
                const angleRad = Math.atan2(line.y2! - line.y1!, line.x2! - line.x1!);
                const headLength = Math.max(brushSize * 10, 120);
                const wingAngle = Math.PI / 6;
                const ux = -Math.cos(angleRad);
                const uy = -Math.sin(angleRad);
                const cosA = Math.cos(wingAngle);
                const sinA = Math.sin(wingAngle);
                const lx = line.x2! + headLength * (ux * cosA - uy * sinA);
                const ly = line.y2! + headLength * (ux * sinA + uy * cosA);
                const rx = line.x2! + headLength * (ux * cosA + uy * sinA);
                const ry = line.y2! + headLength * (-ux * sinA + uy * cosA);
                const sw = line.strokeWidth || brushSize / 2;
                const leftWing = new fabric.Line([line.x2!, line.y2!, lx, ly], {
                    stroke: brushColor,
                    strokeWidth: sw,
                    strokeLineCap: 'round',
                } as any);
                const rightWing = new fabric.Line([line.x2!, line.y2!, rx, ry], {
                    stroke: brushColor,
                    strokeWidth: sw,
                    strokeLineCap: 'round',
                } as any);
                canvas.add(leftWing);
                canvas.add(rightWing);
                const group = new fabric.Group([line, leftWing, rightWing], {
                    selectable: true,
                    evented: true,
                } as any);
                canvas.remove(line);
                canvas.remove(leftWing);
                canvas.remove(rightWing);
                canvas.add(group);
            }

            activeObjectRef.current = null;

            if (activeTool === 'line' || activeTool === 'arrow') {
                (canvas as any).skipTargetFind = true;
                canvas.getObjects().forEach((o) => {
                    if ((o as any).name !== '__background__' && (o as any).name !== '__crop__') {
                        o.selectable = false;
                        o.evented = false;
                    }
                });
            }
        };

        const handleObjectScaling = (opt: any) => {
            const obj = opt.target as any;
            if (!obj) return;
            const isTextbox = obj.type === 'textbox' || obj instanceof fabric.Textbox;
            const isIText = obj.type === 'i-text' || obj instanceof fabric.IText;
            if (isTextbox || isIText) {
                const corner = opt?.transform?.corner as string | undefined;
                if (corner === 'ml' || corner === 'mr') {
                    const newW = Math.max(50, (obj.width || 50) * (obj.scaleX || 1));
                    obj.set({ width: newW, scaleX: 1, scaleY: 1 });
                } else {
                    const s = obj.scaleX || 1;
                    const base = obj.fontSize || 40;
                    const next = Math.max(6, Math.min(512, Math.round(base * s)));
                    obj.set({ fontSize: next, scaleX: 1, scaleY: 1 });
                }
                obj.setCoords();
                canvas.requestRenderAll();
            }
        };
        const handleMouseOver = () => { if (activeTool === 'brush' && brushCursorRef.current) { brushCursorRef.current.style.display = 'block'; } };
        const handleMouseOut = () => { if (brushCursorRef.current) { brushCursorRef.current.style.display = 'none'; } };
        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);
        canvas.on('mouse:over', handleMouseOver);
        canvas.on('mouse:out', handleMouseOut);
        canvas.on('object:scaling', handleObjectScaling);

        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
            canvas.off('mouse:over', handleMouseOver);
            canvas.off('mouse:out', handleMouseOut);
            canvas.off('object:scaling', handleObjectScaling);
        };
    }, [activeTool, brushColor, brushSize]);

    return (
        <div ref={containerRef} className={`relative flex flex-col w-[800px] h-auto bg-white dark:bg-[#18181b] backdrop-blur-xl border rounded-2xl shadow-xl transition-all ring-1 ${selected ? 'border-neutral-400 shadow-neutral-400/50' : 'border-slate-200 dark:border-white/10 ring-white/5 dark:ring-white/5 ring-black/5'}`}>
            <style>
                {`
                .super-color-input::-webkit-color-swatch-wrapper { padding: 0; }
                .super-color-input::-webkit-color-swatch { border: 1px solid #ffffff; }
                .super-color-input::-moz-color-swatch { border: 1px solid #ffffff; }
                `}
            </style>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl">
                <div className="flex items-center gap-2">
                    <MousePointer2 className="text-slate-800 dark:text-white" size={16} />
                    <span className="text-xs font-bold tracking-wider uppercase text-slate-800 dark:text-white">自由画布</span>
                </div>
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 dark:bg-green-400 animate-pulse shadow-[0_0_5px_currentColor]"></div>
            </div>

            {/* Content Body */}
            <div className="flex-1 flex flex-col gap-4 p-4">
                {/* Canvas Area */}
                <div ref={canvasContainerRef} className="relative w-full aspect-square bg-slate-100 dark:bg-white/5 rounded-xl overflow-hidden shadow-inner border border-slate-200 dark:border-white/10">
                    <div ref={brushCursorRef} className="pointer-events-none absolute rounded-full border hidden z-10"></div>
                </div>

                {/* Bottom Toolbar Area */}
                <div className="h-12 flex items-center gap-2">
                    {/* Tools Section */}
                    <div className="flex-1 flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-lg overflow-x-auto scrollbar-hide border border-slate-200 dark:border-white/10">
                        {[
                            { id: 'select', icon: MousePointer2, label: 'Select' },
                            { id: 'pencil', icon: Pencil, label: 'Pencil' },
                            { id: 'brush', icon: Brush, label: 'Brush' },
                            { id: 'line', icon: Minus, label: 'Line' },
                            { id: 'arrow', icon: ArrowRight, label: 'Arrow' },
                            { id: 'text', icon: Type, label: 'Text' },
                            { id: 'eraser', icon: Eraser, label: 'Eraser' },
                            { id: 'crop', icon: Crop, label: 'Crop' },
                        ].map((tool) => (
                            <button
                                key={tool.id}
                                onClick={() => setActiveTool(tool.id as ToolType)}
                                className={`p-2 rounded-lg transition-all ${activeTool === tool.id
                                    ? 'bg-neutral-500/20 text-neutral-400 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                    }`}
                                title={tool.label}
                            >
                                <tool.icon size={16} />
                            </button>
                        ))}

                        <div className="w-px h-4 bg-white/10 mx-1" />

                        {/* Actions */}
                        <button onClick={() => {
                            const canvas = fabricCanvas.current;
                            const activeObj = canvas?.getActiveObject();
                            if (activeObj) {
                                canvas?.remove(activeObj);
                                canvas?.requestRenderAll();
                            }
                        }} className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5 transition-all" title="Delete">
                            <Trash2 size={16} />
                        </button>

                        <button onClick={() => {
                            const canvas = fabricCanvas.current;
                            const activeObj = canvas?.getActiveObject();
                            if (activeObj) {
                                (canvas as any)?.bringObjectToFront(activeObj);
                                canvas?.requestRenderAll();
                            }
                        }} className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all" title="Bring to Front">
                            <MoveUp size={16} />
                        </button>

                        <button onClick={() => {
                            const canvas = fabricCanvas.current;
                            const activeObj = canvas?.getActiveObject();
                            if (activeObj) {
                                (canvas as any)?.sendObjectToBack(activeObj);
                                // Ensure background stays at back
                                const bg = canvas?.getObjects().find(o => (o as any).name === '__background__');
                                if (bg) (canvas as any)?.sendObjectToBack(bg);
                                canvas?.requestRenderAll();
                            }
                        }} className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all" title="Send to Back">
                            <MoveDown size={16} />
                        </button>

                        <div className="w-px h-4 bg-white/10 mx-1" />

                        {/* Color Picker */}
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-gray-400">Color</label>
                            <input
                                type="color"
                                value={brushColor}
                                onChange={(e) => setBrushColor(e.target.value)}
                                className="super-color-input w-4 h-4 rounded cursor-pointer border border-slate-200 dark:border-white/10"
                                title="Brush Color"
                            />
                        </div>

                        {/* Brush Size Slider */}
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-gray-400">Size</label>
                            <input
                                type="range"
                                min={activeTool === 'brush' ? 80 : 10}
                                max={activeTool === 'brush' ? 400 : 30}
                                value={brushSize}
                                onChange={(e) => {
                                    const newSize = parseInt(e.target.value);
                                    setBrushSize(newSize);
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                className="nodrag w-10 h-2 bg-slate-200 dark:bg-white/10 rounded-lg appearance-none cursor-pointer"
                                title="Brush Size"
                            />
                            <span className="text-[10px] text-gray-400 w-5 text-right">{brushSize}</span>
                        </div>

                        <div className="w-px h-4 bg-white/10 mx-1" />

                        {/* Export Button */}
                        <button 
                            disabled={activeTool === 'crop'}
                            onClick={async () => {
                            const canvas = fabricCanvas.current;
                            if (!canvas) return;

                            // 1. Deselect everything
                            canvas.discardActiveObject();

                            // 2. Save current state
                            const originalVpt = [...canvas.viewportTransform!]; // Copy array
                            const originalWidth = canvas.getWidth();
                            const originalHeight = canvas.getHeight();

                            // 3. Reset to full resolution (1:1)
                            canvas.setViewportTransform([1, 0, 0, 1, 0, 0] as unknown as fabric.TMat2D);
                            canvas.setWidth(INTERNAL_SIZE);
                            canvas.setHeight(INTERNAL_SIZE);

                            // 4. Handle Export
                            const savedClipPath = canvas.clipPath;
                            canvas.clipPath = undefined; // Remove clip for toDataURL to work on full canvas

                            const crop = appliedCropRef.current;
                            let dataURL: string = '';
                            let outW = width;
                            let outH = height;

                            if (crop) {
                                outW = crop.width;
                                outH = crop.height;

                                dataURL = canvas.toDataURL({
                                    format: 'png',
                                    quality: 1,
                                    left: crop.left,
                                    top: crop.top,
                                    width: crop.width,
                                    height: crop.height,
                                    multiplier: 1
                                });
                            } else {
                                // Full canvas
                                dataURL = canvas.toDataURL({
                                    format: 'png',
                                    quality: 1,
                                    multiplier: 1,
                                    left: 0,
                                    top: 0,
                                    width: width,
                                    height: height
                                });
                            }

                            // 5. Restore state
                            canvas.clipPath = savedClipPath;
                            canvas.setViewportTransform(originalVpt as unknown as fabric.TMat2D);
                            canvas.setWidth(originalWidth);
                            canvas.setHeight(originalHeight);
                            canvas.requestRenderAll();

                            const ratioStr = `${outW}:${outH}`;

                            const currentNode = getNode(id);
                            if (!currentNode) return;

                            // 🚀 上传 base64 到 OSS，避免工作流数据膨胀
                            let finalImageUrl = dataURL;
                            try {
                                // 将 base64 转换为 Blob
                                const base64Data = dataURL.split(',')[1];
                                const byteCharacters = atob(base64Data);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i++) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);
                                const blob = new Blob([byteArray], { type: 'image/png' });

                                // 获取预签名 URL
                                const fileName = `canvas-export-${Date.now()}.png`;
                                const presignedRes = await apiClient.post('/assets/presigned-url', {
                                    fileName,
                                    contentType: 'image/png',
                                });

                                if (presignedRes.success && presignedRes.data) {
                                    const { uploadUrl, publicUrl } = presignedRes.data;
                                    
                                    // 直传到 OSS
                                    const axios = (await import('axios')).default;
                                    await axios.put(uploadUrl, blob, {
                                        headers: { 'Content-Type': 'image/png' },
                                        timeout: 300000,
                                    });
                                    
                                    finalImageUrl = publicUrl;
                                    console.log('[SuperCanvas] 图片已上传到 OSS:', publicUrl);
                                }
                            } catch (uploadError) {
                                console.warn('[SuperCanvas] 上传到 OSS 失败，使用 base64:', uploadError);
                                // 失败时回退使用 base64（但后端会清理）
                            }

                            const zoom = (getViewport && (getViewport() as any)?.zoom) || 1;
                            const parentEl = document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement | null;
                            const parentWpx = parentEl?.getBoundingClientRect().width || 400;
                            const parentW = Math.round(parentWpx / zoom);

                            const previewWidth = 400;
                            const parseRatio = (r?: string, defH = 300) => {
                                if (!r || !/^[0-9]+\s*:\s*[0-9]+$/.test(r)) return defH;
                                const [rw, rh] = r.split(':').map((v) => parseFloat(v));
                                if (!rw || !rh) return defH;
                                return Math.round(previewWidth * (rh / rw));
                            };
                            const spacingX = 200;
                            const spacingY = 100;
                            const targetH = parseRatio(ratioStr, 300);

                            const allNodes = getNodes();
                            const edges = getEdges();
                            const connectedPreviewNodes = allNodes.filter(node => node.type === 'imagePreview' && edges.some(edge => edge.source === id && edge.target === node.id));
                            const existingCount = connectedPreviewNodes.length;

                            const posX = currentNode.position.x + parentW + spacingX;
                            const posY = currentNode.position.y + existingCount * (targetH + spacingY);

                            const previewNode = {
                                id: `preview-${id}-${Date.now()}`,
                                type: 'imagePreview',
                                position: { x: posX, y: posY },
                                data: {
                                    imageUrl: finalImageUrl,  // 使用 OSS URL 而非 base64
                                    width: previewWidth,
                                    ratio: ratioStr,
                                    workflowContext: (currentNode as any).data?.workflowContext,
                                    createdBy: (currentNode as any).data?.createdBy, // 🔑 继承父节点的创建者信息（协作者拖动权限）
                                },
                            } as any;

                            setNodes((nds: any[]) => [...nds, previewNode]);

                            const newEdge = {
                                id: `edge-${id}-${previewNode.id}`,
                                source: id,
                                target: previewNode.id,
                                targetHandle: `${previewNode.id}-target`,
                                type: 'aurora',
                            } as any;

                            setEdges((eds: any[]) => {
                                const existingEdge = eds.find((e: any) => e.source === id && e.target === previewNode.id);
                                if (existingEdge) return eds;
                                return [...eds, newEdge];
                            });
                        }}
                            className="nodrag px-3 py-2 text-[10px] font-bold rounded-lg border transition-all active:scale-95 flex items-center justify-center whitespace-nowrap bg-neutral-800 dark:bg-white text-white dark:text-black text-white shadow-md hover:shadow-lg border-transparent dark:border-white/10 disabled:cursor-not-allowed disabled:hover:shadow-md"
                            title={activeTool === 'crop' ? '请先完成裁切（按Enter）' : '导出图片'}
                        >
                            <span>导出图片</span>
                        </button>
                    </div>
                </div>

                {/* Input Handle */}
                <CustomHandle
                    type="target"
                    position={Position.Left}
                    id="input-image"
                    style={{ top: '50%' }}
                    className="!w-4 !h-4 !border-2 !rounded-full !bg-[#0a0a0a] !border-neutral-500 hover:!scale-125 !transition-transform !cursor-crosshair"
                />

                {/* Output Handle */}
                <CustomHandle
                    type="source"
                    position={Position.Right}
                    id="output-image"
                    style={{ top: '50%' }}
                    className="!w-4 !h-4 !border-2 !rounded-full !bg-[#0a0a0a] !border-neutral-500 hover:!scale-125 !transition-transform !cursor-crosshair"
                />
            </div>
        </div>
    );
};

export default memo(SuperCanvasNode);
