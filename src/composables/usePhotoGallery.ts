import { ref, onMounted, watch } from 'vue';
import { Plugins, CameraResultType, CameraSource, CameraPhoto, Capacitor, FilesystemDirectory } from '@capacitor/core';
import { isPlatform } from '@ionic/vue';
import { actionSheetController } from '@ionic/vue';
import { trash, close } from 'ionicons/icons';

export interface Photo {
    filepath: string;
    webviewPath?: string;
}

export function usePhotoGallery() {
    const PHOTO_STORAGE = "photos";
    const { Camera, Filesystem, Storage } = Plugins;
    const photos = ref<Photo[]>([]);

    const convertBlobtoBase64 = (blob: Blob) => new Promise((resolve, reject) => {
        const reader = new FileReader;
        reader.onerror = reject;
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.readAsDataURL(blob)
    });

    const savePicture = async (photo: CameraPhoto, fileName: string): Promise<Photo> => {
        let base64Data: string;

        // "hybrid" will detect if we are running on iOS or Android
        if (isPlatform('hybrid')) {
            const file = await Filesystem.readFile({
                path: photo.path!
            });
            base64Data = file.data;
        } else {
            const response = await fetch(photo.webPath!);
            const blob = await response.blob();
            base64Data = await convertBlobtoBase64(blob) as string;
        }

        const savedFile = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: FilesystemDirectory.Data
        });

        if (isPlatform('hybrid')) {
            return {
                filepath: savedFile.uri,
                webviewPath: Capacitor.convertFileSrc(savedFile.uri)
            };
        } else {
            return {
                filepath: fileName,
                webviewPath: photo.webPath
            } 
        }

    }

    const cachePhotos = () => {
        Storage.set({
            key: PHOTO_STORAGE,
            value: JSON.stringify(photos.value)
        })
    }

    const deletePhoto = async (photo: Photo) => {
        // remove photo from array
        photos.value = photos.value.filter(p => p.filepath !== photo.filepath);
        // remove photo from file system
        const filename = photo.filepath.substr(photo.filepath.lastIndexOf('/') + 1);
        await Filesystem.deleteFile({
            path: filename,
            directory: FilesystemDirectory.Data
        });
    }

    const showActionSheet = async (photo: Photo) => {
        const actionSheet = await actionSheetController.create({
            header: 'Photos',
            buttons: [{
                text: 'Delete',
                role: 'destructive',
                icon: trash,
                handler: () => {
                    deletePhoto(photo);
            }}, {
                text: 'Cancel',
                icon: close,
                role: 'cancel',
                handler: () => { // do nothing when cancel is clicked }
            }

            }]
        });
        await actionSheet.present();
    }

    watch(photos, cachePhotos);

    const loadSaved = async () => {
        const photoList = await Storage.get({ key: PHOTO_STORAGE});
        const photosInStorage = photoList.value ? JSON.parse(photoList.value) : [];

        if (!isPlatform('hybrid')) {
            for (const photo of photosInStorage) {
                const file = await Filesystem.readFile({
                    path: photo.filepath,
                    directory: FilesystemDirectory.Data
                });
    
                photo.webviewPath = `data:image/jpeg;base64,${file.data}`;
            }
        }

        photos.value = photosInStorage;
    }

    onMounted(loadSaved);

    const takePhoto = async () => {
        const cameraPhoto = await Camera.getPhoto({
            resultType: CameraResultType.Uri,
            source: CameraSource.Camera,
            quality: 100
        });
        const fileName = new Date().getTime() + '.jpeg';
        const savedFileImage = await savePicture(cameraPhoto, fileName);
        photos.value = [savedFileImage, ...photos.value];
    };

    return {
        photos,
        takePhoto,
        deletePhoto,
        showActionSheet
    }
}